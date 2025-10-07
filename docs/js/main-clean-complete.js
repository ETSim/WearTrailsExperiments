// Main Application - Complete Refactored Version
// PiP OBB Physics - Enhanced Collision Visualization
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';

// Import modules
import { generateRandomGroundTexture, generateRandomCubeTexture } from './textures.js';
import { sampleContacts, getRealContacts, getSyntheticContacts, separateContacts } from './contacts.js';
import { computeBoundingBox } from './bounding-box/index.js';
import { BodyManager } from './body-manager.js';
import {
  createOBBVisualization,
  updateOBBVisualization,
  createContactVisualization,
  updateContactPoints,
  updateGeomMeanMarker
} from './visualization.js';
import { 
  setupPiPCanvases, 
  renderPiPViews
} from './rendering.js';
import { PiPManager } from './pip/index.js';
import { saveCanvasAsPNG } from './utils.js';

// Initialize Ammo.js
const A = await Ammo();

// ======= Configuration =======
const CFG = {
  PLANE_SIZE: 40,
  PIP_W: 256,
  PIP_H: 256,
  OBB_DEPTH: 2.5,
  MIN_CONTACT_SIZE: 0.05,
  CONTACT_POINT_SIZE: 0.12,
  GEOM_MEAN_SIZE: 0.18
};

// ======= Scene Manager Class =======
class SceneManager {
  constructor() {
    this.scene = null;
    this.camera = null;
    this.renderer = null;
    this.controls = null;
  }

  init() {
    // Scene setup
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x0b0b0b);

    // Camera setup
    const aspect = innerWidth / innerHeight;
    this.camera = new THREE.PerspectiveCamera(60, aspect, 0.1, 200);
    this.camera.position.set(12, 10, 12);
    this.camera.lookAt(0, 0, 0);

    // Renderer setup
    this.renderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true });
    this.renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
    this.renderer.setSize(innerWidth, innerHeight);
    document.body.appendChild(this.renderer.domElement);

    // Controls setup
    this.controls = new OrbitControls(this.camera, this.renderer.domElement);
    this.controls.enableRotate = true;
    this.controls.enablePan = true;
    this.controls.enableZoom = true;
    this.controls.target.set(0, 0, 0);
    this.controls.minDistance = 5;
    this.controls.maxDistance = 50;
    this.controls.maxPolarAngle = Math.PI * 0.9;
    this.controls.update();

    // Lights
    this.scene.add(new THREE.AmbientLight(0xffffff, 0.4));
    const dirLight = new THREE.DirectionalLight(0xffffff, 0.7);
    dirLight.position.set(10, 15, 5);
    this.scene.add(dirLight);

    // Under light
    const underLight = new THREE.PointLight(0xffffff, 0.3, 30);
    underLight.position.set(0, -2, 0);
    this.scene.add(underLight);

    // Window resize handler
    addEventListener('resize', () => {
      this.camera.aspect = innerWidth / innerHeight;
      this.camera.updateProjectionMatrix();
      this.renderer.setSize(innerWidth, innerHeight);
    });

    return {
      scene: this.scene,
      camera: this.camera,
      renderer: this.renderer,
      controls: this.controls
    };
  }
}

// ======= Physics Manager Class =======
class PhysicsManager {
  constructor() {
    this.world = null;
    this.dispatcher = null;
  }

  async init() {
    // Physics world setup
    const cfg = new A.btSoftBodyRigidBodyCollisionConfiguration();
    this.dispatcher = new A.btCollisionDispatcher(cfg);
    const broadphase = new A.btDbvtBroadphase();
    const solver = new A.btSequentialImpulseConstraintSolver();
    const softBodySolver = new A.btDefaultSoftBodySolver();
    this.world = new A.btSoftRigidDynamicsWorld(this.dispatcher, broadphase, solver, cfg, softBodySolver);
    this.world.setGravity(new A.btVector3(0, -9.81, 0));
    this.world.getWorldInfo().set_m_gravity(new A.btVector3(0, -9.81, 0));

    return {
      A: A,
      world: this.world,
      dispatcher: this.dispatcher
    };
  }
}

// ======= Ground Manager Class =======
class GroundManager {
  constructor(scene, world, A, CFG) {
    this.scene = scene;
    this.world = world;
    this.A = A;
    this.CFG = CFG;
    this.ground = null;
    this.wallObstacleMesh = null;
    this.wallObstacleBody = null;
  }

  init() {
    // Ground texture
    const groundTextureCanvas = generateRandomGroundTexture(2048, false);
    const groundTexture = new THREE.CanvasTexture(groundTextureCanvas);
    groundTexture.wrapS = THREE.RepeatWrapping;
    groundTexture.wrapT = THREE.RepeatWrapping;
    groundTexture.repeat.set(2, 2);
    
    // Ground normal map
    const groundNormalCanvas = generateRandomGroundTexture(2048, true);
    const groundNormalMap = new THREE.CanvasTexture(groundNormalCanvas);
    groundNormalMap.wrapS = THREE.RepeatWrapping;
    groundNormalMap.wrapT = THREE.RepeatWrapping;
    groundNormalMap.repeat.set(2, 2);

    // Ground mesh
    this.ground = new THREE.Mesh(
      new THREE.PlaneGeometry(this.CFG.PLANE_SIZE, this.CFG.PLANE_SIZE, 100, 100),
      new THREE.MeshStandardMaterial({
        map: groundTexture,
        normalMap: groundNormalMap,
        normalScale: new THREE.Vector2(0.2, 0.2), // Subtle normal effect for flat surface
        roughness: 0.9,
        metalness: 0.1,
        side: THREE.FrontSide
      })
    );
    this.ground.rotation.x = -Math.PI / 2;
    this.ground.position.y = 0.00;
    this.ground.receiveShadow = true;
    this.scene.add(this.ground);

    // Ground physics body
    const groundShape = new this.A.btBoxShape(new this.A.btVector3(this.CFG.PLANE_SIZE / 2, 0.5, this.CFG.PLANE_SIZE / 2));
    const gTr = new this.A.btTransform();
    gTr.setIdentity();
    gTr.setOrigin(new this.A.btVector3(0, -0.5, 0));
    const gMotion = new this.A.btDefaultMotionState(gTr);
    const gInfo = new this.A.btRigidBodyConstructionInfo(0, gMotion, groundShape, new this.A.btVector3(0, 0, 0));
    const groundBody = new this.A.btRigidBody(gInfo);
    groundBody.setFriction(0.5);
    groundBody.setRestitution(0.6);
    groundBody.setRollingFriction(0.1);
    this.world.addRigidBody(groundBody);

    // Wall obstacle
    const wallObstacleWidth = 8;
    const wallObstacleHeight = 3;
    const wallObstacleDepth = 0.5;

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

    // Wall obstacle physics
    const wallObstacleShape = new this.A.btBoxShape(new this.A.btVector3(wallObstacleWidth / 2, wallObstacleHeight / 2, wallObstacleDepth / 2));
    const wallObstacleTr = new this.A.btTransform();
    wallObstacleTr.setIdentity();
    wallObstacleTr.setOrigin(new this.A.btVector3(0, wallObstacleHeight / 2, 0));
    const wallObstacleMotion = new this.A.btDefaultMotionState(wallObstacleTr);
    const wallObstacleInfo = new this.A.btRigidBodyConstructionInfo(0, wallObstacleMotion, wallObstacleShape, new this.A.btVector3(0, 0, 0));
    this.wallObstacleBody = new this.A.btRigidBody(wallObstacleInfo);
    this.wallObstacleBody.setFriction(0.8);
    this.wallObstacleBody.setRestitution(0.7);

    return {
      ground: this.ground,
      wallObstacleMesh: this.wallObstacleMesh,
      wallObstacleBody: this.wallObstacleBody
    };
  }
}

// ======= Stamping Manager Class =======
class StampingManager {
  constructor(scene, CFG) {
    this.scene = scene;
    this.CFG = CFG;
    this.stampCanvas = null;
    this.stampCtx = null;
    this.stampTexture = null;
    this.stampOverlay = null;
  }

  init() {
    // Stamping canvas
    this.stampCanvas = document.createElement('canvas');
    this.stampCanvas.width = 2048;
    this.stampCanvas.height = 2048;
    this.stampCtx = this.stampCanvas.getContext('2d', { willReadFrequently: true, alpha: true });
    
    // Initialize with transparent background but ensure proper alpha handling
    this.stampCtx.save();
    this.stampCtx.globalCompositeOperation = 'source-over';
    this.stampCtx.clearRect(0, 0, 2048, 2048);
    this.stampCtx.restore();

    this.stampTexture = new THREE.CanvasTexture(this.stampCanvas);
    this.stampTexture.wrapS = THREE.ClampToEdgeWrapping;
    this.stampTexture.wrapT = THREE.ClampToEdgeWrapping;
    this.stampTexture.minFilter = THREE.LinearFilter;
    this.stampTexture.magFilter = THREE.LinearFilter;

    // Stamp overlay
    this.stampOverlay = new THREE.Mesh(
      new THREE.PlaneGeometry(this.CFG.PLANE_SIZE, this.CFG.PLANE_SIZE),
      new THREE.MeshBasicMaterial({
        map: this.stampTexture,
        color: 0xffffff,
        transparent: true,
        opacity: 0.8,
        side: THREE.FrontSide,
        depthWrite: false,
        depthTest: false,
        blending: THREE.AdditiveBlending
      })
    );
    this.stampOverlay.rotation.x = -Math.PI / 2;
    this.stampOverlay.position.y = 0.05; // Move above field and flow overlays
    this.stampOverlay.receiveShadow = false;
    this.stampOverlay.castShadow = false;
    this.stampOverlay.visible = false;
    this.stampOverlay.renderOrder = 1000; // Ensure it renders on top
    this.scene.add(this.stampOverlay);

    return {
      stampCanvas: this.stampCanvas,
      stampCtx: this.stampCtx,
      stampTexture: this.stampTexture,
      stampOverlay: this.stampOverlay
    };
  }

  clearStamps() {
    this.stampCtx.clearRect(0, 0, this.stampCanvas.width, this.stampCanvas.height);
    this.stampTexture.needsUpdate = true;
  }
}


// ======= Flow Accumulation Manager Class =======
class FlowAccumulationManager {
  constructor(scene, CFG, THREE) {
    this.scene = scene;
    this.CFG = CFG;
    this.THREE = THREE;
    this.flowCanvas = null;
    this.flowCtx = null;
    this.flowTexture = null;
    this.flowOverlay = null;

    // Accumulators
    this.flowDirX = null;              // Average direction X (for visualization)
    this.flowDirZ = null;              // Average direction Z (for visualization)
    this.wearAccumulation = null;      // Accumulated wear: velocity × force × intensity
    this.energyWearAccumulation = null; // Energy-based wear: (K_E/H) × μ × p × v × dt

    // Rendering parameters
    this.maxWearThreshold = 0.01;      // Adaptive threshold for wear visualization (only increases)

    // Parameters - Simple Model
    this.flowAlpha = 0.15;
    this.density = 1.0; // kg/m²

    // Parameters - Energy-Based Model
    // Note: Friction coefficient (μ) is taken from window.bodyManager.friction
    this.hardness = 1e9;     // Material hardness (H) in Pa - default 1 GPa
    this.K_E = 1e-3;         // Energy wear coefficient (dimensionless)
    this.useEnergyModel = false; // Toggle between models
  }

  init() {
    // Flow accumulation canvas (same resolution as stamps)
    this.flowCanvas = document.createElement('canvas');
    this.flowCanvas.width = 2048;
    this.flowCanvas.height = 2048;
    this.flowCtx = this.flowCanvas.getContext('2d', { willReadFrequently: true, alpha: true });

    // Initialize accumulators
    const size = this.flowCanvas.width * this.flowCanvas.height;
    this.flowDirX = new Float32Array(size);
    this.flowDirZ = new Float32Array(size);
    this.wearAccumulation = new Float32Array(size);
    this.energyWearAccumulation = new Float32Array(size);

    // Clear canvas
    this.flowCtx.clearRect(0, 0, 2048, 2048);

    // Create texture
    this.flowTexture = new this.THREE.CanvasTexture(this.flowCanvas);
    this.flowTexture.wrapS = this.THREE.ClampToEdgeWrapping;
    this.flowTexture.wrapT = this.THREE.ClampToEdgeWrapping;
    this.flowTexture.minFilter = this.THREE.LinearFilter;
    this.flowTexture.magFilter = this.THREE.LinearFilter;

    // Flow overlay on ground
    this.flowOverlay = new this.THREE.Mesh(
      new this.THREE.PlaneGeometry(this.CFG.PLANE_SIZE, this.CFG.PLANE_SIZE),
      new this.THREE.MeshBasicMaterial({
        map: this.flowTexture,
        color: 0xffffff,
        transparent: true,
        opacity: 0.8,
        side: this.THREE.FrontSide,
        depthWrite: false,
        depthTest: false,
        blending: this.THREE.AdditiveBlending
      })
    );
    this.flowOverlay.rotation.x = -Math.PI / 2;
    this.flowOverlay.position.y = 0.03; // Above stamps
    this.flowOverlay.receiveShadow = false;
    this.flowOverlay.castShadow = false;
    this.flowOverlay.visible = false;
    this.flowOverlay.renderOrder = 999;
    this.scene.add(this.flowOverlay);

    return {
      flowCanvas: this.flowCanvas,
      flowCtx: this.flowCtx,
      flowTexture: this.flowTexture,
      flowOverlay: this.flowOverlay
    };
  }

  /**
   * Cross product for rotational velocity: ω × r
   */
  crossProduct(omega, r) {
    return {
      x: omega.y * r.z - omega.z * r.y,
      y: omega.z * r.x - omega.x * r.z,
      z: omega.x * r.y - omega.y * r.x
    };
  }

  /**
   * Convert HSV to RGB
   */
  hsvToRgb(h, s, v) {
    const i = Math.floor(h * 6);
    const f = h * 6 - i;
    const p = v * (1 - s);
    const q = v * (1 - f * s);
    const t = v * (1 - (1 - f) * s);

    let r, g, b;
    switch (i % 6) {
      case 0: r = v; g = t; b = p; break;
      case 1: r = q; g = v; b = p; break;
      case 2: r = p; g = v; b = t; break;
      case 3: r = p; g = q; b = v; break;
      case 4: r = t; g = p; b = v; break;
      case 5: r = v; g = p; b = q; break;
    }

    return [Math.round(r * 255), Math.round(g * 255), Math.round(b * 255)];
  }

  /**
   * Accumulate flow at stamping location
   */
  accumulate(pixels1, pixels2, velocity, angularVelocity, normalForceValue, lastOBB, stampWorldX, stampWorldZ) {
    if (!velocity || !lastOBB) return;

    const W_pip = this.CFG.PIP_W;
    const H_pip = this.CFG.PIP_H;
    const W_canvas = this.flowCanvas.width;
    const H_canvas = this.flowCanvas.height;

    // Get OBB parameters
    const center = lastOBB.center;
    const width = lastOBB.width;
    const height = lastOBB.height;
    const e1 = lastOBB.e1;
    const e2 = lastOBB.e2;

    // Contact plane normal (ground plane: pointing up)
    const normal = { x: 0, y: 1, z: 0 };

    // Calculate stamp size
    const paddedWidth = width * window.state.paddingWidthScale;
    const paddedHeight = height * window.state.paddingHeightScale;
    const stampSizeWorld = Math.max(paddedWidth, paddedHeight);

    // FIRST PASS: Count intersection pixels and calculate contact area
    let intersectionPixelCount = 0;
    for (let y = 0; y < H_pip; y++) {
      for (let x = 0; x < W_pip; x++) {
        const pipIdx = (y * W_pip + x) * 4;
        const has1 = (pixels1[pipIdx] | pixels1[pipIdx+1] | pixels1[pipIdx+2]) > 10;
        const has2 = (pixels2[pipIdx] | pixels2[pipIdx+1] | pixels2[pipIdx+2]) > 10;
        if (has1 && has2) {
          intersectionPixelCount++;
        }
      }
    }

    // Calculate contact area in world units
    // Each pixel represents a portion of the OBB area
    const pixelAreaWorld = (width * height) / (W_pip * H_pip);
    const contactArea = intersectionPixelCount * pixelAreaWorld;

    // Calculate pressure: P = F / A (force per unit area)
    // Avoid division by zero
    const pressure = contactArea > 0.001 ? normalForceValue / contactArea : 0;

    // SECOND PASS: Process each pixel in intersection with accurate pressure
    for (let y = 0; y < H_pip; y++) {
      for (let x = 0; x < W_pip; x++) {
        const pipIdx = (y * W_pip + x) * 4;

        // Check if pixel is in intersection
        const has1 = (pixels1[pipIdx] | pixels1[pipIdx+1] | pixels1[pipIdx+2]) > 10;
        const has2 = (pixels2[pipIdx] | pixels2[pipIdx+1] | pixels2[pipIdx+2]) > 10;

        if (has1 && has2) {
          // Convert PiP pixel to world space (relative to OBB center)
          const u = (x / W_pip) - 0.5;
          const v = (y / H_pip) - 0.5;

          const worldX = center.x + u * width * e1.x + v * height * e2.x;
          const worldZ = center.z + u * width * e1.z + v * height * e2.z;

          // Position vector from center
          const r = {
            x: worldX - center.x,
            y: 0,
            z: worldZ - center.z
          };

          // Calculate rotational velocity: v_rot = ω × r
          let v_rot = { x: 0, y: 0, z: 0 };
          if (angularVelocity) {
            v_rot = this.crossProduct(angularVelocity, r);
          }

          // Total 3D velocity
          const v_3d = {
            x: velocity.x + v_rot.x,
            y: v_rot.y,
            z: velocity.z + v_rot.z
          };

          // Project to tangent plane (remove normal component)
          const v_dot_n = v_3d.x * normal.x + v_3d.y * normal.y + v_3d.z * normal.z;
          const v_tangential = {
            x: v_3d.x - v_dot_n * normal.x,
            y: v_3d.y - v_dot_n * normal.y,
            z: v_3d.z - v_dot_n * normal.z
          };

          // Use accurate pressure from contact force distribution
          // Pressure is already calculated as total normal force / contact area
          // Each intersection pixel gets an equal share of the pressure

          // Calculate tangential velocity magnitude
          const velMag = Math.sqrt(
            v_tangential.x * v_tangential.x +
            v_tangential.z * v_tangential.z
          );

          if (velMag > 0.01) {
            // Map world coordinates to ground canvas coordinates
            const canvasX = Math.round(((worldX + this.CFG.PLANE_SIZE / 2) / this.CFG.PLANE_SIZE) * W_canvas);
            const canvasY = Math.round(((worldZ + this.CFG.PLANE_SIZE / 2) / this.CFG.PLANE_SIZE) * H_canvas);

            // Check bounds
            if (canvasX >= 0 && canvasX < W_canvas && canvasY >= 0 && canvasY < H_canvas) {
              const canvasIdx = canvasY * W_canvas + canvasX;

              // Normalize direction
              const normDirX = v_tangential.x / velMag;
              const normDirZ = v_tangential.z / velMag;

              // Simple wear formula: Tangential Velocity × Pressure × Intensity
              // Both velocity AND pressure must be present for wear to occur (multiplicative)
              const wearRate = velMag * pressure * this.flowAlpha;
              this.wearAccumulation[canvasIdx] += wearRate;

              // Energy-based wear formula: dWear = (K_E / H) × μ × p × v × dt × intensity
              // Uses friction coefficient from simulator physics
              const mu = window.bodyManager ? window.bodyManager.friction : 0.3;

              // Shear stress: τ = μ × p
              const tau = mu * pressure;

              // Frictional power: P = τ × v_tangential
              const power = tau * velMag;

              // Time step (convert stampInterval from ms to seconds)
              const dt = window.state.stampInterval / 1000.0;

              // Dissipated energy: dE = P × dt
              const dE = power * dt;

              // Energy-based wear: dWear = (K_E / H) × dE × intensity
              // Apply flowAlpha for consistent accumulation rate with simple model
              const energyWear = (this.K_E / this.hardness) * dE * this.flowAlpha;
              this.energyWearAccumulation[canvasIdx] += energyWear;

              // Track dominant direction (bidirectional - strongest wear direction wins)
              // Only update direction if this wear contribution is significant
              const currentDirMag = Math.sqrt(
                this.flowDirX[canvasIdx] * this.flowDirX[canvasIdx] +
                this.flowDirZ[canvasIdx] * this.flowDirZ[canvasIdx]
              );

              // Update direction if this is first contact OR if wear rate is significant
              if (currentDirMag < 0.01 || wearRate > this.wearAccumulation[canvasIdx] * 0.05) {
                // Blend direction weighted by wear contribution (bidirectional accumulation)
                const blendFactor = wearRate / (this.wearAccumulation[canvasIdx] + wearRate);
                this.flowDirX[canvasIdx] = this.flowDirX[canvasIdx] * (1 - blendFactor) + normDirX * blendFactor;
                this.flowDirZ[canvasIdx] = this.flowDirZ[canvasIdx] * (1 - blendFactor) + normDirZ * blendFactor;
              }
            }
          }
        }
      }
    }
  }

  /**
   * Render accumulated wear with HSV directional encoding
   * Hue = wear direction, Saturation = full, Value = intensity (logarithmic scaling)
   * Supports both simple and energy-based models
   */
  render() {
    const W = this.flowCanvas.width;
    const H = this.flowCanvas.height;

    // Choose which accumulator to visualize
    const wearData = this.useEnergyModel ?
      this.energyWearAccumulation :
      this.wearAccumulation;

    // Update adaptive threshold (only increases, never decreases)
    // This prevents existing pixels from dimming as new wear accumulates
    let currentMaxWear = 0.01;
    for (let i = 0; i < wearData.length; i++) {
      if (wearData[i] > currentMaxWear) {
        currentMaxWear = wearData[i];
      }
    }

    // Only increase threshold, never decrease (prevents dimming)
    if (currentMaxWear > this.maxWearThreshold) {
      this.maxWearThreshold = currentMaxWear;
    }

    // Create output image
    const outputData = this.flowCtx.createImageData(W, H);

    for (let i = 0; i < wearData.length; i++) {
      const wear = wearData[i];
      const idx = i * 4;

      if (wear > 0.001) {
        // Get wear direction from stored direction vectors
        const dirX = this.flowDirX[i];
        const dirZ = this.flowDirZ[i];

        // Calculate angle from direction vector
        const angle = Math.atan2(dirZ, dirX);

        // HSV Encoding for bidirectional wear:
        // Hue: Direction of tangential velocity (wear direction)
        // Saturation: Full saturation (100%) - no normalization
        // Value: Wear intensity (logarithmic scaling to prevent saturation)

        // Map angle to hue (0-1): -π to π maps to 0 to 1
        const hue = (angle + Math.PI) / (2 * Math.PI);

        // Saturation: full saturation (no normalization)
        const saturation = 1.0;

        // Value: logarithmic scaling for better dynamic range
        // This prevents old pixels from dimming as new wear accumulates
        const value = Math.min(1.0, Math.log(1 + wear * 100) / Math.log(1 + this.maxWearThreshold * 100));

        // Convert HSV to RGB
        const [r, g, b] = this.hsvToRgb(hue, saturation, value);

        outputData.data[idx] = r;
        outputData.data[idx + 1] = g;
        outputData.data[idx + 2] = b;
        outputData.data[idx + 3] = Math.round(Math.min(255, value * 255)); // Alpha based on intensity
      } else {
        // Transparent
        outputData.data[idx] = 0;
        outputData.data[idx + 1] = 0;
        outputData.data[idx + 2] = 0;
        outputData.data[idx + 3] = 0;
      }
    }

    // Render to canvas
    this.flowCtx.putImageData(outputData, 0, 0);
    this.flowTexture.needsUpdate = true;
  }

  clearFlow() {
    this.flowDirX.fill(0);
    this.flowDirZ.fill(0);
    this.wearAccumulation.fill(0);
    this.energyWearAccumulation.fill(0);
    this.maxWearThreshold = 0.01; // Reset adaptive threshold
    this.flowCtx.clearRect(0, 0, this.flowCanvas.width, this.flowCanvas.height);
    this.flowTexture.needsUpdate = true;
  }
}


// ======= UI Manager Class =======
class UIManager {
  constructor() {
    this.initialized = false;
  }

  initializeEventListeners() {
    // Hide loading screen and show HUD
    document.getElementById('loadingScreen').style.display = 'none';
    document.getElementById('hud').style.display = 'flex';

    // Body controls
    this.setupBodyControls();
    this.setupPhysicsControls();
    this.setupVisualizationControls();
    this.setupStampingControls();

    this.initialized = true;
  }

  setupBodyControls() {
    document.getElementById('start').onclick = () => {
      window.bodyManager.start();
      window.state.isPaused = false;
      document.getElementById('pause').textContent = 'Pause';
    };

    document.getElementById('reset').onclick = () => {
      window.bodyManager.reset();
      window.state.isPaused = false;
      window.stepCounter = 0;
      this.updateStepCounter();
      document.getElementById('pause').textContent = 'Pause';
    };

    document.getElementById('pause').onclick = () => {
      window.state.isPaused = !window.state.isPaused;
      document.getElementById('pause').textContent = window.state.isPaused ? 'Resume' : 'Pause';
    };

    document.getElementById('stepFrame').onclick = () => {
      window.state.isPaused = true;
      window.singleStep = true;
      window.stepCounter++;
      this.updateStepCounter();
    };

    document.getElementById('shape').onchange = (e) => {
      window.bodyManager.setShapeType(e.target.value);
      document.getElementById('customBodyRow').style.display =
        (e.target.value === 'custom') ? 'flex' : 'none';
      document.getElementById('softBodySection').style.display =
        (e.target.value === 'cubeSoft') ? 'block' : 'none';

      // Hide variant row when not using custom body
      if (e.target.value !== 'custom') {
        document.getElementById('variantRow').style.display = 'none';
        window.bodyManager.start();
      }
    };

    document.getElementById('bodyFile').onchange = async (e) => {
      if (e.target.files && e.target.files[0]) {
        window.bodyManager.setCustomBodyURL(URL.createObjectURL(e.target.files[0]));
        await window.bodyManager.start();

        // Check for KHR variants and populate dropdown
        const variantInfo = window.bodyManager.getVariantInfo();
        const variantRow = document.getElementById('variantRow');
        const variantSelect = document.getElementById('variantSelect');
        const variantCount = document.getElementById('variantCount');

        if (variantInfo && variantInfo.names && variantInfo.names.length > 0) {
          // Populate dropdown with variant names
          variantSelect.innerHTML = '';
          variantInfo.names.forEach((name, index) => {
            const option = document.createElement('option');
            option.value = index;
            option.textContent = name || `Variant ${index + 1}`;
            variantSelect.appendChild(option);
          });

          // Update count and show row
          variantCount.textContent = `${variantInfo.names.length} variants`;
          variantRow.style.display = 'flex';
        } else {
          // No variants found, hide row
          variantSelect.innerHTML = '<option value="-1">No variants available</option>';
          variantCount.textContent = '0';
          variantRow.style.display = 'none';
        }
      }
    };

    // Variant selection handler
    document.getElementById('variantSelect').onchange = async (e) => {
      const variantIndex = parseInt(e.target.value);
      if (variantIndex >= 0) {
        await window.bodyManager.setVariant(variantIndex);
      }
    };

    document.getElementById('mass').oninput = (e) => {
      const mass = parseFloat(e.target.value);
      const displayValue = mass < 10 ? mass.toFixed(1) : Math.round(mass).toString();
      document.getElementById('massValue').textContent = displayValue + ' kg';
      window.bodyManager.setMass(mass);
      window.bodyManager.start();
    };

    document.getElementById('bboxAlgo').onchange = (e) => {
      window.state.bboxAlgorithm = e.target.value;
      document.getElementById('bboxType').textContent = e.target.options[e.target.selectedIndex].text;
    };
  }

  setupPhysicsControls() {
    // Padding controls
    document.getElementById('paddingWidth').oninput = (e) => {
      window.state.paddingWidthScale = parseInt(e.target.value) / 100;
      document.getElementById('paddingWidthVal').textContent = window.state.paddingWidthScale.toFixed(2) + 'x';
    };

    document.getElementById('paddingHeight').oninput = (e) => {
      window.state.paddingHeightScale = parseInt(e.target.value) / 100;
      document.getElementById('paddingHeightVal').textContent = window.state.paddingHeightScale.toFixed(2) + 'x';
    };

    document.getElementById('paddingDepthTop').oninput = (e) => {
      window.state.paddingDepthTopScale = parseInt(e.target.value) / 100;
      document.getElementById('paddingDepthTopVal').textContent = window.state.paddingDepthTopScale.toFixed(2) + 'x';
    };

    document.getElementById('paddingDepthBottom').oninput = (e) => {
      window.state.paddingDepthBottomScale = parseInt(e.target.value) / 100;
      document.getElementById('paddingDepthBottomVal').textContent = window.state.paddingDepthBottomScale.toFixed(2) + 'x';
    };

    // Speed controls
    document.getElementById('speedX').oninput = (e) => {
      const s = parseInt(e.target.value);
      document.getElementById('speedXVal').textContent = String(s);
      window.bodyManager.setSpeed(s, window.bodyManager.speedZ);
      this.updateBodyVelocity();
    };

    document.getElementById('speedZ').oninput = (e) => {
      const s = parseInt(e.target.value);
      document.getElementById('speedZVal').textContent = String(s);
      window.bodyManager.setSpeed(window.bodyManager.speedX, s);
      this.updateBodyVelocity();
    };

    // Force controls
    document.getElementById('forceX').oninput = (e) => {
      window.state.forceX = parseInt(e.target.value);
      document.getElementById('forceXVal').textContent = String(window.state.forceX);
    };

    document.getElementById('forceY').oninput = (e) => {
      window.state.forceY = parseInt(e.target.value);
      document.getElementById('forceYVal').textContent = String(window.state.forceY);
    };

    document.getElementById('forceZ').oninput = (e) => {
      window.state.forceZ = parseInt(e.target.value);
      document.getElementById('forceZVal').textContent = String(window.state.forceZ);
    };

    // Physics parameters
    document.getElementById('gravity').oninput = (e) => {
      window.state.gravity = parseInt(e.target.value) / 100;
      document.getElementById('gravityVal').textContent = window.state.gravity.toFixed(2);
      window.world.setGravity(new window.A.btVector3(0, -window.state.gravity, 0));
    };

    document.getElementById('friction').oninput = (e) => {
      const friction = parseFloat(e.target.value) || 0;
      document.getElementById('frictionVal').textContent = friction.toFixed(2);
      window.bodyManager.setFriction(friction);
    };

    document.getElementById('restitution').oninput = (e) => {
      const restitution = parseFloat(e.target.value) || 0;
      document.getElementById('restitutionVal').textContent = restitution.toFixed(2);
      window.bodyManager.setRestitution(restitution);
    };

    document.getElementById('linearDamping').oninput = (e) => {
      const damping = parseInt(e.target.value) / 100;
      document.getElementById('linearDampingVal').textContent = damping.toFixed(2);
      window.bodyManager.setLinearDamping(damping);
    };

    document.getElementById('angularDamping').oninput = (e) => {
      const damping = parseInt(e.target.value) / 100;
      document.getElementById('angularDampingVal').textContent = damping.toFixed(2);
      window.bodyManager.setAngularDamping(damping);
    };

    // Physics timestep controls
    document.getElementById('timestep').oninput = (e) => {
      window.state.timestepHz = parseInt(e.target.value);
      document.getElementById('timestepVal').textContent = window.state.timestepHz + ' Hz';
    };

    document.getElementById('maxSubsteps').oninput = (e) => {
      window.state.maxSubsteps = parseInt(e.target.value);
      document.getElementById('maxSubstepsVal').textContent = window.state.maxSubsteps.toString();
    };

    document.getElementById('fixedTimestep').oninput = (e) => {
      window.state.fixedTimestep = parseInt(e.target.value);
      document.getElementById('fixedTimestepVal').textContent = window.state.fixedTimestep + ' Hz';
    };

    // Sub-stepping control
    document.getElementById('subStepping').oninput = (e) => {
      window.subStepping = parseInt(e.target.value);
      document.getElementById('subSteppingVal').textContent = window.subStepping;
    };
  }

  setupVisualizationControls() {
    const pipEnabledEl = document.getElementById('pipEnabled');
    if (pipEnabledEl) {
      pipEnabledEl.onchange = (e) => {
        window.state.pipEnabled = e.target.checked;
        document.getElementById('pipContainer').style.display = window.state.pipEnabled ? 'flex' : 'none';
      };
    }

    const showOBBEl = document.getElementById('showOBB');
    if (showOBBEl) {
      showOBBEl.onchange = (e) => {
        window.state.showOBB = e.target.checked;
        if (window.visualizationManager.obbGroup) window.visualizationManager.obbGroup.visible = window.state.showOBB;
      };
    }

    const showContactsEl = document.getElementById('showContacts');
    if (showContactsEl) {
      showContactsEl.onchange = (e) => {
        window.state.showContacts = e.target.checked;
      };
    }

    const showGeomCenterEl = document.getElementById('showGeomCenter');
    if (showGeomCenterEl) {
      showGeomCenterEl.onchange = (e) => {
        window.state.showGeomCenter = e.target.checked;
      };
    }

    const showWallObstacleEl = document.getElementById('showWallObstacle');
    if (showWallObstacleEl) {
      showWallObstacleEl.onchange = (e) => {
        window.state.showWallObstacle = e.target.checked;
        window.wallObstacleMesh.visible = window.state.showWallObstacle;
        
        if (window.state.showWallObstacle) {
          window.world.addRigidBody(window.wallObstacleBody);
        } else {
          window.world.removeRigidBody(window.wallObstacleBody);
        }
      };
    }
  }

  setupStampingControls() {
    const showStampsEl = document.getElementById('showStamps');
    if (showStampsEl) {
      showStampsEl.onchange = (e) => {
        window.state.showStamps = e.target.checked;
        if (window.stampingManager && window.stampingManager.stampOverlay) {
          window.stampingManager.stampOverlay.visible = window.state.showStamps;

          // Force texture update to ensure stamps are visible
          if (window.state.showStamps) {
            window.stampingManager.stampTexture.needsUpdate = true;
          }
        }
      };
      
      // Initialize the checkbox state
      showStampsEl.checked = window.state.showStamps;
    }

    const clearStampsEl = document.getElementById('clearStamps');
    if (clearStampsEl) {
      clearStampsEl.onclick = () => {
        window.stampingManager.clearStamps();
      };
    }

    const saveStampsEl = document.getElementById('saveStamps');
    if (saveStampsEl) {
      saveStampsEl.onclick = () => {
        window.saveCanvasAsPNG(window.stampingManager.stampCanvas, 'stamps.png');
      };
    }

    const clearFlowEl = document.getElementById('clearFlow');
    if (clearFlowEl) {
      clearFlowEl.onclick = () => {
        window.flowAccumulationManager.clearFlow();
      };
    }

    const saveFlowEl = document.getElementById('saveFlow');
    if (saveFlowEl) {
      saveFlowEl.onclick = () => {
        window.saveCanvasAsPNG(window.flowAccumulationManager.flowCanvas, 'wear-map.png');
      };
    }

    const showFlowOverlayEl = document.getElementById('showFlowOverlay');
    if (showFlowOverlayEl) {
      showFlowOverlayEl.onchange = (e) => {
        if (window.flowAccumulationManager && window.flowAccumulationManager.flowOverlay) {
          window.flowAccumulationManager.flowOverlay.visible = e.target.checked;
        }
      };
      // Initialize visibility
      if (window.flowAccumulationManager && window.flowAccumulationManager.flowOverlay) {
        window.flowAccumulationManager.flowOverlay.visible = showFlowOverlayEl.checked;
      }
    }

    const useEnergyModelEl = document.getElementById('useEnergyModel');
    if (useEnergyModelEl) {
      useEnergyModelEl.onchange = (e) => {
        if (window.flowAccumulationManager) {
          window.flowAccumulationManager.useEnergyModel = e.target.checked;

          // Show/hide energy model parameters
          const params = ['energyModelParams1', 'energyModelParams2', 'energyModelParams3'];
          params.forEach(id => {
            const el = document.getElementById(id);
            if (el) el.style.display = e.target.checked ? '' : 'none';
          });

          // Re-render with new model
          window.flowAccumulationManager.render();
        }
      };
    }

    const wearIntensityEl = document.getElementById('wearIntensity');
    const wearIntensityValEl = document.getElementById('wearIntensityVal');
    if (wearIntensityEl && wearIntensityValEl) {
      wearIntensityEl.oninput = (e) => {
        const val = parseFloat(e.target.value) / 100.0;
        wearIntensityValEl.textContent = val.toFixed(2);
        if (window.flowAccumulationManager) {
          window.flowAccumulationManager.flowAlpha = val;
        }
        // pip6 now shows instantaneous wear rate (no accumulation parameter)
      };
    }

    const frictionCoeffEl = document.getElementById('frictionCoeff');
    const frictionCoeffValEl = document.getElementById('frictionCoeffVal');
    if (frictionCoeffEl && frictionCoeffValEl) {
      frictionCoeffEl.oninput = (e) => {
        const val = parseFloat(e.target.value);
        frictionCoeffValEl.textContent = val.toFixed(2);
        if (window.flowAccumulationManager) {
          window.flowAccumulationManager.mu = val;
        }
      };
    }

    const hardnessEl = document.getElementById('hardness');
    const hardnessValEl = document.getElementById('hardnessVal');
    if (hardnessEl && hardnessValEl) {
      hardnessEl.oninput = (e) => {
        const val = parseFloat(e.target.value);
        hardnessValEl.textContent = val.toFixed(1) + ' GPa';
        if (window.flowAccumulationManager) {
          window.flowAccumulationManager.hardness = val * 1e9; // GPa to Pa
        }
      };
    }

    const wearCoeffEl = document.getElementById('wearCoeff');
    const wearCoeffValEl = document.getElementById('wearCoeffVal');
    if (wearCoeffEl && wearCoeffValEl) {
      wearCoeffEl.oninput = (e) => {
        const val = parseFloat(e.target.value);
        wearCoeffValEl.textContent = val.toFixed(4);
        if (window.flowAccumulationManager) {
          window.flowAccumulationManager.K_E = val;
        }
      };
    }


    const stampIntervalEl = document.getElementById('stampInterval');
    if (stampIntervalEl) {
      stampIntervalEl.oninput = (e) => {
        window.state.stampInterval = parseInt(e.target.value);
        document.getElementById('stampIntervalVal').textContent = window.state.stampInterval + ' ms';
      };
    }
  }


  updateBodyVelocity() {
    const dynBody = window.bodyManager.getBody();
    const dynMesh = window.bodyManager.getMesh();
    
    if (dynBody) {
      if (dynMesh && dynMesh.userData.isSoftBody) {
        const nodes = dynBody.get_m_nodes();
        const nodeCount = nodes.size();
        for (let i = 0; i < nodeCount; i++) {
          const node = nodes.at(i);
          const currentVel = node.get_m_v();
          const newVel = new window.A.btVector3(window.bodyManager.speedX, currentVel.y(), window.bodyManager.speedZ);
          node.set_m_v(newVel);
          window.A.destroy(newVel);
        }
        dynBody.setActivationState(4);
      } else {
        const v = dynBody.getLinearVelocity();
        dynBody.setLinearVelocity(new window.A.btVector3(window.bodyManager.speedX, v.y(), window.bodyManager.speedZ));
        dynBody.activate();
        window.A.destroy(v);
      }
    }
  }


  initializeCollapsibleSections() {
    const collapsibles = document.querySelectorAll('.collapsible');
    collapsibles.forEach(collapsible => {
      collapsible.addEventListener('click', () => {
        const targetId = collapsible.getAttribute('data-target');
        const details = document.getElementById(targetId);
        const icon = collapsible.querySelector('.toggle-icon');

        if (details.style.display === 'none' || details.style.display === '') {
          details.style.display = 'block';
          icon.textContent = '▼';
        } else {
          details.style.display = 'none';
          icon.textContent = '▶';
        }
      });
    });

    // Close subsections by default
    const closedSubsections = ['paddingControlsDetails', 'speedControlsDetails', 'forceControlsDetails', 'physicsParametersDetails'];
    closedSubsections.forEach(sectionId => {
      const details = document.getElementById(sectionId);
      const collapsible = document.querySelector(`[data-target="${sectionId}"]`);
      if (details && collapsible) {
        details.style.display = 'none';
        const icon = collapsible.querySelector('.toggle-icon');
        if (icon) icon.textContent = '▶';
      }
    });
  }

  updateStepCounter() {
    const stepCounterEl = document.getElementById('stepCounter');
    if (stepCounterEl) {
      stepCounterEl.textContent = window.stepCounter || 0;
    }
  }
}

// ======= Animation Manager Class =======
class AnimationManager {
  constructor(scene, camera, renderer, bodyManager, pipManager, visualizationManager, stampingManager) {
    this.scene = scene;
    this.camera = camera;
    this.renderer = renderer;
    this.bodyManager = bodyManager;
    this.pipManager = pipManager;
    this.visualizationManager = visualizationManager;
    this.stampingManager = stampingManager;

    this.frame = 0;
    this.lastT = performance.now();
    this.lastFrameTime = performance.now();
    this.lastStampTime = 0;
    this.tmpTr = new A.btTransform();

    this.RESET_BOUNDARY = CFG.PLANE_SIZE / 2;
    this.RESET_Y_THRESHOLD = -5;
    
    this.contactResult = { 
      count: 0, 
      geometricCenter: { x: 0, z: 0 }, 
      avgContactPoint: { x: 0, y: 0, z: 0 },
      avgContactNormal: { x: 0, y: 1, z: 0 }
    };
  }

  start() {
    this.animate();
  }

  animate() {
    requestAnimationFrame(() => this.animate());
    this.frame++;

    const now = performance.now();
    
    // Update FPS
    if (now - this.lastT > 500) {
      const fps = Math.round(1000 / (now - this.lastT) * this.frame);
      document.getElementById('fps').textContent = String(fps);
      this.lastT = now;
      this.frame = 0;
    }
    document.getElementById('frame').textContent = String(this.frame);

    // Get dynamic body reference
    const dynBody = this.bodyManager.getBody();
    const dynMesh = this.bodyManager.getMesh();
    
    // Physics step - handle single step mode and sub-stepping
    const shouldUpdatePhysics = !window.state.isPaused || window.singleStep;

    if (shouldUpdatePhysics) {
      this.stepPhysics(now, dynBody, dynMesh);

      // Apply sub-stepping (run physics multiple times per frame)
      const subSteps = window.subStepping || 1;
      for (let i = 0; i < subSteps; i++) {
        window.world.stepSimulation(1 / window.state.timestepHz, window.state.maxSubsteps, 1 / window.state.fixedTimestep);
      }

      // Increment step counter for each physics update
      window.stepCounter++;
      if (window.uiManager) {
        window.uiManager.updateStepCounter();
      }

      // Reset single step flag after stepping
      if (window.singleStep) {
        window.singleStep = false;
      }
    }
    
    // Update body position and check bounds
    if (dynBody && dynMesh) {
      this.updateBodyTransform(dynBody, dynMesh);
    }

    // Sample contacts
    const newContactResult = sampleContacts(window.dispatcher, THREE, dynMesh, window.MIN_CONTACTS_FOR_STABLE_BOX, window.softGroundThreshold);
    window.state.contactSamples = newContactResult.contactSamples;
    this.contactResult = newContactResult;
    
    // Update UI stats
    this.updateStats(dynBody, dynMesh);
    
    // Update visualization
    this.updateVisualization(dynBody, dynMesh);

    // Compute bounding box
    this.updateBoundingBox(dynMesh, dynBody);

    // Render main scene
    this.renderer.render(this.scene, this.camera);

    // Render PiP views and handle stamping
    this.renderPiPAndStamp(now, dynBody, dynMesh);
  }

  stepPhysics(now, dynBody, dynMesh) {
    const dt = Math.min(1 / 30, Math.max(1 / 240, (now - this.lastFrameTime) / 1000));
    this.lastFrameTime = now;
    
    if (dynBody && dynMesh) {
      if (dynMesh.userData.isSoftBody) {
        this.updateSoftBodyPhysics(dynBody, dt);
      } else {
        this.updateRigidBodyPhysics(dynBody, dt);
      }
    }
  }

  updateSoftBodyPhysics(dynBody, dt) {
    const nodes = dynBody.get_m_nodes();
    const nodeCount = nodes.size();
    
    let avgVx = 0, avgVy = 0, avgVz = 0;
    for (let i = 0; i < nodeCount; i++) {
      const node = nodes.at(i);
      const nodeVel = node.get_m_v();
      avgVx += nodeVel.x();
      avgVy += nodeVel.y();
      avgVz += nodeVel.z();
    }
    avgVx /= nodeCount;
    avgVy /= nodeCount;
    avgVz /= nodeCount;
    
    const targetSpeedX = this.bodyManager.speedX;
    const targetSpeedZ = this.bodyManager.speedZ;
    
    const speedDiffX = targetSpeedX - avgVx;
    const speedDiffZ = targetSpeedZ - avgVz;
    
    let accelX = 0, accelY = 0, accelZ = 0;
    if (window.state.forceX !== 0 || window.state.forceY !== 0 || window.state.forceZ !== 0) {
      const mass = this.bodyManager.mass || 2;
      accelX = window.state.forceX / mass;
      accelY = window.state.forceY / mass;
      accelZ = window.state.forceZ / mass;
    }
    
    for (let i = 0; i < nodeCount; i++) {
      const node = nodes.at(i);
      const currentVel = node.get_m_v();
      
      const speedCorrectionStrength = 0.1;
      let newVelX = currentVel.x() + speedDiffX * speedCorrectionStrength;
      let newVelY = currentVel.y();
      let newVelZ = currentVel.z() + speedDiffZ * speedCorrectionStrength;
      
      if (window.state.forceX !== 0 || window.state.forceY !== 0 || window.state.forceZ !== 0) {
        newVelX += accelX * dt;
        newVelY += accelY * dt;
        newVelZ += accelZ * dt;
      }
      
      const newVel = new A.btVector3(newVelX, newVelY, newVelZ);
      node.set_m_v(newVel);
      A.destroy(newVel);
    }
    
    dynBody.setActivationState(4);
  }

  updateRigidBodyPhysics(dynBody, dt) {
    if (window.state.forceX !== 0 || window.state.forceY !== 0 || window.state.forceZ !== 0) {
      const impulse = new A.btVector3(window.state.forceX * dt, window.state.forceY * dt, window.state.forceZ * dt);
      dynBody.applyCentralImpulse(impulse);
      A.destroy(impulse);
      dynBody.activate();
    }
  }

  updateBodyTransform(dynBody, dynMesh) {
    if (dynMesh.userData.isSoftBody && dynMesh.userData.updateSoftBodyMesh) {
      dynMesh.userData.updateSoftBodyMesh();
      dynMesh.visible = true;
      
      // Check soft body bounds using center of mass
      const softBody = dynMesh.userData.physicsBody;
      const nodes = softBody.get_m_nodes();
      const nodeCount = nodes.size();
      
      if (nodeCount > 0) {
        let avgX = 0, avgY = 0, avgZ = 0;
        for (let i = 0; i < nodeCount; i++) {
          const node = nodes.at(i);
          const nodePos = node.get_m_x();
          avgX += nodePos.x();
          avgY += nodePos.y();
          avgZ += nodePos.z();
        }
        avgX /= nodeCount;
        avgY /= nodeCount;
        avgZ /= nodeCount;
        
        if (Math.abs(avgX) > this.RESET_BOUNDARY || 
            Math.abs(avgZ) > this.RESET_BOUNDARY || 
            avgY < this.RESET_Y_THRESHOLD) {
          this.bodyManager.reset();
        }
      }
    } else {
      dynBody.getMotionState().getWorldTransform(this.tmpTr);
      const p = this.tmpTr.getOrigin();
      const q = this.tmpTr.getRotation();
      dynMesh.position.set(p.x(), p.y(), p.z());
      dynMesh.quaternion.set(q.x(), q.y(), q.z(), q.w());
      dynMesh.visible = true;
      
      if (Math.abs(p.x()) > this.RESET_BOUNDARY || 
          Math.abs(p.z()) > this.RESET_BOUNDARY || 
          p.y() < this.RESET_Y_THRESHOLD) {
        this.bodyManager.reset();
      }
    }
  }

  updateStats(dynBody, dynMesh) {
    // Display filtered count for more accurate representation
    const displayCount = this.contactResult.filteredCount || 0;
    document.getElementById('contacts').textContent = String(displayCount);

    // Update separate real/synthetic contact counts in UI
    const realContactsEl = document.getElementById('realContacts');
    const syntheticContactsEl = document.getElementById('syntheticContacts');

    if (realContactsEl) {
      realContactsEl.textContent = String(this.contactResult.realContactCount || 0);
    }

    if (syntheticContactsEl) {
      syntheticContactsEl.textContent = String(this.contactResult.syntheticCount || 0);
      // Style differently if synthetic contacts are present
      if (this.contactResult.syntheticCount > 0) {
        syntheticContactsEl.style.fontWeight = 'bold';
      } else {
        syntheticContactsEl.style.fontWeight = 'normal';
      }
    }

    if (displayCount > 0) {
      document.getElementById('gcenter').textContent =
        `(${this.contactResult.geometricCenter.x.toFixed(3)}, ${this.contactResult.geometricCenter.z.toFixed(3)})`;
    } else {
      document.getElementById('gcenter').textContent = '—';
    }

    // Update velocity and force displays
    if (this.frame % 10 === 0 && dynBody && dynMesh) {
      this.updateVelocityDisplay(dynBody, dynMesh);
      this.updateAngularVelocityDisplay(dynBody, dynMesh);
    }

    this.updateForceDisplay();
  }

  updateVelocityDisplay(dynBody, dynMesh) {
    if (dynMesh.userData.isSoftBody) {
      const nodes = dynBody.get_m_nodes();
      const nodeCount = nodes.size();
      let avgVx = 0, avgVy = 0, avgVz = 0;
      for (let i = 0; i < nodeCount; i++) {
        const node = nodes.at(i);
        const nodeVel = node.get_m_v();
        avgVx += nodeVel.x();
        avgVy += nodeVel.y();
        avgVz += nodeVel.z();
      }
      avgVx /= nodeCount;
      avgVy /= nodeCount;
      avgVz /= nodeCount;
      const velMag = Math.sqrt(avgVx * avgVx + avgVy * avgVy + avgVz * avgVz);
      document.getElementById('velocity').textContent = 
        `${velMag.toFixed(2)} m/s (${avgVx.toFixed(1)}, ${avgVy.toFixed(1)}, ${avgVz.toFixed(1)})`;
    } else {
      const lv = dynBody.getLinearVelocity();
      const velMag = Math.sqrt(lv.x() * lv.x() + lv.y() * lv.y() + lv.z() * lv.z());
      document.getElementById('velocity').textContent = 
        `${velMag.toFixed(2)} m/s (${lv.x().toFixed(1)}, ${lv.y().toFixed(1)}, ${lv.z().toFixed(1)})`;
      A.destroy(lv);
    }
  }

  updateAngularVelocityDisplay(dynBody, dynMesh) {
    if (!dynMesh.userData.isSoftBody) {
      const av = dynBody.getAngularVelocity();
      const angVelMag = Math.sqrt(av.x() * av.x() + av.y() * av.y() + av.z() * av.z());
      const rpm = (angVelMag * 60) / (2 * Math.PI);
      document.getElementById('angularVel').textContent = 
        `${angVelMag.toFixed(2)} rad/s (${rpm.toFixed(0)} RPM)`;
      A.destroy(av);
    } else {
      document.getElementById('angularVel').textContent = 'N/A (soft body)';
    }
  }

  updateForceDisplay() {
    const totalForce = Math.sqrt(window.state.forceX * window.state.forceX + window.state.forceY * window.state.forceY + window.state.forceZ * window.state.forceZ);
    if (totalForce > 0) {
      document.getElementById('appliedForce').textContent = 
        `${totalForce.toFixed(1)} N (${window.state.forceX}, ${window.state.forceY}, ${window.state.forceZ})`;
    } else {
      document.getElementById('appliedForce').textContent = '0 N';
    }
  }

  updateVisualization(dynBody, dynMesh) {
    // Use filteredCount instead of raw count for more accurate visualization
    const displayCount = this.contactResult.filteredCount || this.contactResult.count || 0;
    updateContactPoints(this.visualizationManager.contactPointsGroup, window.state.contactSamples, window.state.showContacts, CFG, THREE);
    updateGeomMeanMarker(this.visualizationManager.geomMeanMarker, displayCount > 0 ? this.contactResult.geometricCenter : null, window.state.showGeomCenter);
  }

  updateBoundingBox(dynMesh, dynBody) {
    if (dynMesh && window.state.contactSamples.length > 0) {
      const isSoftBody = dynMesh.userData.isSoftBody || false;
      const obb = computeBoundingBox(
        window.state.contactSamples,
        this.contactResult.avgContactPoint,
        this.contactResult.avgContactNormal,
        window.state.bboxAlgorithm,
        CFG,
        THREE,
        dynBody,
        A,
        window.state.lastOBB,
        window.state.previousVelocity,
        window.state.previousAngle,
        window.ANGLE_STABILITY_THRESHOLD,
        isSoftBody
      );
      
      if (obb) {
        window.state.lastOBB = obb;
        updateOBBVisualization(this.visualizationManager.obbGroup, obb, window.state.paddingWidthScale, window.state.paddingHeightScale, window.state.paddingDepthTopScale, window.state.paddingDepthBottomScale, CFG, THREE);
        this.visualizationManager.obbGroup.visible = window.state.showOBB;
        const angDeg = (obb.theta * 180 / Math.PI).toFixed(2);
        document.getElementById('obbAng').textContent = angDeg + '°';
      }
    } else {
      window.state.lastOBB = null;
      if (this.visualizationManager.obbGroup) this.visualizationManager.obbGroup.visible = false;
      document.getElementById('obbAng').textContent = '—';
    }
  }

  renderPiPAndStamp(now, dynBody, dynMesh) {
    // Calculate camera rotation, velocity, and angular velocity for PiP rendering
    let cameraRotation = null;
    let velocity = null;
    let angularVelocity = null;
    let normalForce = 20.0;

    if (dynBody && window.state.lastOBB) {
      if (dynMesh && dynMesh.userData.isSoftBody) {
        const nodes = dynBody.get_m_nodes();
        const nodeCount = nodes.size();
        let avgVx = 0, avgVy = 0, avgVz = 0;

        for (let i = 0; i < nodeCount; i++) {
          const node = nodes.at(i);
          const nodeVel = node.get_m_v();
          avgVx += nodeVel.x();
          avgVy += nodeVel.y();
          avgVz += nodeVel.z();
        }

        if (nodeCount > 0) {
          avgVx /= nodeCount;
          avgVy /= nodeCount;
          avgVz /= nodeCount;
          velocity = { x: avgVx, y: avgVy, z: avgVz };
          const velocityMag = Math.sqrt(avgVx * avgVx + avgVz * avgVz);
          if (velocityMag > 0.5) {
            cameraRotation = Math.atan2(-avgVz, avgVx);
          }
        }

        // Soft bodies don't have rigid angular velocity
        angularVelocity = { x: 0, y: 0, z: 0 };
      } else {
        const lv = dynBody.getLinearVelocity();
        velocity = { x: lv.x(), y: lv.y(), z: lv.z() };
        const velocityMag = Math.sqrt(lv.x() * lv.x() + lv.z() * lv.z());
        if (velocityMag > 0.5) {
          cameraRotation = Math.atan2(-lv.z(), lv.x());
        }
        A.destroy(lv);

        // Get angular velocity for rigid bodies
        const av = dynBody.getAngularVelocity();
        angularVelocity = { x: av.x(), y: av.y(), z: av.z() };
        A.destroy(av);
      }

      // Calculate normal force
      if (dynMesh) {
        let verticalVelocity = 0;
        if (dynMesh.userData.isSoftBody) {
          if (velocity) verticalVelocity = velocity.y || 0;
        } else {
          const lv = dynBody.getLinearVelocity();
          verticalVelocity = lv.y();
          A.destroy(lv);
        }

        const mass = this.bodyManager.mass || 2;
        const weight = mass * window.state.gravity;
        const impactFactor = Math.max(0, -verticalVelocity * 2);
        normalForce = weight * (1.0 + impactFactor);
      }
    }

    // Render PiP views
    this.pipManager.renderAll(
      window.state.pipEnabled,
      window.state.lastOBB,
      window.state.paddingWidthScale,
      window.state.paddingHeightScale,
      window.state.paddingDepthTopScale,
      window.state.paddingDepthBottomScale,
      cameraRotation,
      velocity,
      angularVelocity,
      normalForce
    );
    
    // Handle stamping
    if (window.state.enableStamping && now - this.lastStampTime >= window.state.stampInterval && window.state.lastOBB && window.state.contactSamples.length > 0) {
      // Stamp without ground collision validation
      this.handleStamping(now, velocity, normalForce);
    }
  }


  isValidGroundCollision(dynBody, dynMesh) {
    if (!dynBody || !dynMesh) return false;
    
    // Check if the body is actually in contact with the ground
    let hasGroundContact = false;
    let bodyLowestY = Infinity;
    let groundContactPoints = 0;
    
    if (dynMesh.userData.isSoftBody) {
      // For soft bodies, check if any nodes are near ground level
      const nodes = dynBody.get_m_nodes();
      const nodeCount = nodes.size();
      
      for (let i = 0; i < nodeCount; i++) {
        const node = nodes.at(i);
        const nodePos = node.get_m_x();
        const nodeY = nodePos.y();
        
        if (nodeY < bodyLowestY) bodyLowestY = nodeY;
        
        // Consider ground contact if node is within threshold of ground plane (y=0)
        if (nodeY <= window.softGroundThreshold) {
          groundContactPoints++;
          hasGroundContact = true;
        }
      }
      
      // Require at least 2 contact points for soft bodies to ensure reasonable ground contact
      if (groundContactPoints < 2) {
        hasGroundContact = false;
      }
    } else {
      // For rigid bodies, check position and contact manifolds
      const tmpTr = new A.btTransform();
      dynBody.getMotionState().getWorldTransform(tmpTr);
      const bodyPos = tmpTr.getOrigin();
      bodyLowestY = bodyPos.y();
      
      // Consider ground contact if body is close to ground plane (tighter threshold)
      if (bodyLowestY <= 0.5) { // Stricter threshold - body must be very close to ground
        // Check contact manifolds for actual ground collision
        const manifolds = window.dispatcher.getNumManifolds();
        for (let i = 0; i < manifolds; i++) {
          const m = window.dispatcher.getManifoldByIndexInternal(i);
          const body0 = m.getBody0();
          const body1 = m.getBody1();
          
          // Check if one of the bodies is our dynamic body and the other could be ground
          if ((body0 === dynBody || body1 === dynBody) && m.getNumContacts() > 0) {
            // Check contact normal and position to confirm ground contact
            for (let j = 0; j < m.getNumContacts(); j++) {
              const contactPoint = m.getContactPoint(j);
              const normal = contactPoint.get_m_normalWorldOnB();
              const worldPos = contactPoint.get_m_positionWorldOnB();
              
              // Validate this is actually ground contact:
              // 1. Normal points mostly upward
              // 2. Contact point is near ground level (y ≈ 0)
              // 3. Contact is not with wall obstacle (if enabled)
              if (normal && worldPos && 
                  Math.abs(normal.y()) > 0.7 && 
                  worldPos.y() <= 0.1) { // Stricter: contact point must be very close to ground level
                
                // Additional check: ensure contact is not with wall obstacle
                if (window.state.showWallObstacle) {
                  const contactX = worldPos.x();
                  const contactZ = worldPos.z();
                  // Wall obstacle is at x=0, z=0, width=8, depth=0.5
                  const isWallContact = Math.abs(contactX) <= 4.0 && Math.abs(contactZ) <= 0.25;
                  if (!isWallContact) {
                    groundContactPoints++;
                    hasGroundContact = true;
                  }
                } else {
                  groundContactPoints++;
                  hasGroundContact = true;
                }
              }
            }
            if (hasGroundContact) break;
          }
        }
      }
    }
    
    // Also validate that we have enough contact samples for meaningful stamping
    const validContactSamples = window.state.contactSamples.filter(contact => 
      contact.y <= 0.1 // Stricter: contact points must be very close to ground level
    );
    
    const finalResult = hasGroundContact && validContactSamples.length >= 1; // Need at least 1 valid ground contact

    return finalResult;
  }

  handleStamping(now, velocity, normalForce) {
    this.lastStampTime = now;
    
    const intersectionCanvas = document.getElementById('pip3Canvas');
    if (!intersectionCanvas) return;

    // Check if there's content to stamp
    const tempCtx = intersectionCanvas.getContext('2d');
    const checkData = tempCtx.getImageData(130 - 50, 130 - 50, 100, 100);
    let hasContent = false;
    for (let i = 0; i < checkData.data.length; i += 4) {
      if (checkData.data[i] > 30 || checkData.data[i+1] > 30 || checkData.data[i+2] > 30) {
        hasContent = true;
        break;
      }
    }
    
    if (!hasContent) return;

    // Choose stamp position
    let stampWorldX, stampWorldZ;
    if (window.state.useBBoxCenter) {
      if (this.dynMesh) {
        // Calculate 3D bounding box center from mesh
        const box = new window.THREE.Box3().setFromObject(this.dynMesh);
        const center = new window.THREE.Vector3();
        box.getCenter(center);
        stampWorldX = center.x;
        stampWorldZ = center.z;
      } else {
        // Fallback to OBB center if no mesh
        stampWorldX = window.state.lastOBB.center.x;
        stampWorldZ = window.state.lastOBB.center.z;
      }
    } else {
      stampWorldX = this.contactResult.geometricCenter.x;
      stampWorldZ = this.contactResult.geometricCenter.z;
    }
    
    // Calculate stamp size first to validate boundaries
    const paddedWidth = window.state.lastOBB.width * window.state.paddingWidthScale;
    const paddedHeight = window.state.lastOBB.height * window.state.paddingHeightScale;
    const stampSizeWorld = Math.max(paddedWidth, paddedHeight);
    const stampRadius = stampSizeWorld / 2;
    
    // Validate ground plane boundaries - ensure stamp stays within the physical ground plane
    const groundBoundary = CFG.PLANE_SIZE / 2 - stampRadius; // Leave margin for stamp size
    
    // Clamp stamp position to stay within ground plane bounds only
    stampWorldX = Math.max(-groundBoundary, Math.min(groundBoundary, stampWorldX));
    stampWorldZ = Math.max(-groundBoundary, Math.min(groundBoundary, stampWorldZ));
    
    // Convert to canvas coordinates
    const canvasX = ((stampWorldX + CFG.PLANE_SIZE / 2) / CFG.PLANE_SIZE) * this.stampingManager.stampCanvas.width;
    const canvasY = ((stampWorldZ + CFG.PLANE_SIZE / 2) / CFG.PLANE_SIZE) * this.stampingManager.stampCanvas.height;
    const stampSize = stampSizeWorld / CFG.PLANE_SIZE * this.stampingManager.stampCanvas.width;
    
    // Apply stamp
    this.stampingManager.stampCtx.save();
    this.stampingManager.stampCtx.translate(canvasX, canvasY);
    this.stampingManager.stampCtx.scale(1, -1);
    this.stampingManager.stampCtx.globalAlpha = 1.0;
    this.stampingManager.stampCtx.globalCompositeOperation = 'source-over';

    this.stampingManager.stampCtx.drawImage(
      intersectionCanvas,
      -stampSize / 2,
      -stampSize / 2,
      stampSize,
      stampSize
    );

    this.stampingManager.stampCtx.restore();
    this.stampingManager.stampTexture.needsUpdate = true;
    // Ensure the stamp overlay is visible if Show Stamps is enabled
    if (window.state.showStamps && !this.stampingManager.stampOverlay.visible) {
      this.stampingManager.stampOverlay.visible = true;
    }

    // Flow accumulation - get pixels from pip1 and pip2
    const pip1Canvas = document.getElementById('pip1Canvas');
    const pip2Canvas = document.getElementById('pip2Canvas');
    if (pip1Canvas && pip2Canvas && window.flowAccumulationManager) {
      const pip1Ctx = pip1Canvas.getContext('2d');
      const pip2Ctx = pip2Canvas.getContext('2d');
      const pixels1 = pip1Ctx.getImageData(0, 0, CFG.PIP_W, CFG.PIP_H).data;
      const pixels2 = pip2Ctx.getImageData(0, 0, CFG.PIP_W, CFG.PIP_H).data;

      // Get velocity and angular velocity (already calculated earlier in renderPiPAndStamp)
      const dynBody = this.bodyManager.getBody();
      const dynMesh = this.bodyManager.getMesh();

      let velocity = null;
      let angularVelocity = null;

      if (dynBody && window.state.lastOBB) {
        if (dynMesh && dynMesh.userData.isSoftBody) {
          const nodes = dynBody.get_m_nodes();
          const nodeCount = nodes.size();
          let avgVx = 0, avgVy = 0, avgVz = 0;
          for (let i = 0; i < nodeCount; i++) {
            const node = nodes.at(i);
            const nodeVel = node.get_m_v();
            avgVx += nodeVel.x();
            avgVy += nodeVel.y();
            avgVz += nodeVel.z();
          }
          if (nodeCount > 0) {
            avgVx /= nodeCount;
            avgVy /= nodeCount;
            avgVz /= nodeCount;
            velocity = { x: avgVx, y: avgVy, z: avgVz };
          }
          angularVelocity = { x: 0, y: 0, z: 0 };
        } else {
          const lv = dynBody.getLinearVelocity();
          velocity = { x: lv.x(), y: lv.y(), z: lv.z() };
          A.destroy(lv);
          const av = dynBody.getAngularVelocity();
          angularVelocity = { x: av.x(), y: av.y(), z: av.z() };
          A.destroy(av);
        }
      }

      // Accumulate flow
      window.flowAccumulationManager.accumulate(
        pixels1,
        pixels2,
        velocity,
        angularVelocity,
        normalForce,
        window.state.lastOBB,
        stampWorldX,
        stampWorldZ
      );

      // Render flow to ground canvas
      window.flowAccumulationManager.render();

      // Update visibility
      if (window.state.showFlowOverlay && !window.flowAccumulationManager.flowOverlay.visible) {
        window.flowAccumulationManager.flowOverlay.visible = true;
      }
    }
  }
}

// ======= Global Variables =======
let sceneManager, physicsManager, groundManager, visualizationManager, stampingManager, flowAccumulationManager;
let bodyManager, pipManager, uiManager, animationManager;

// ======= State Object =======
const state = {
  isPaused: false,
  showOBB: false,
  showContacts: false,
  showGeomCenter: false,
  showWallObstacle: false,
  showStamps: false,
  pipEnabled: true,
  enableStamping: true,
  useBBoxCenter: false,
  enableSynthetic: true,

  paddingWidthScale: 1.0,
  paddingHeightScale: 1.0,
  paddingDepthTopScale: 0.1,
  paddingDepthBottomScale: 0.1,
  forceX: 0, forceY: 0, forceZ: 0,
  gravity: 9.81,
  timestepHz: 60,
  maxSubsteps: 10,
  fixedTimestep: 120,
  subStepping: 1,

  stampInterval: 280,
  stepCounter: 0,

  bboxAlgorithm: 'aabb',
  lastOBB: null,
  contactSamples: [],
  previousVelocity: new THREE.Vector3(0, 0, 0),
  previousAngle: 0
};

// Constants
const MIN_CONTACTS_FOR_STABLE_BOX = 4;
const ANGLE_STABILITY_THRESHOLD = 25 * Math.PI / 180;
const softGroundThreshold = 0.15;

// ======= Initialize Application =======
async function init() {
  // Initialize managers
  sceneManager = new SceneManager();
  physicsManager = new PhysicsManager();
  
  // Initialize scene
  const sceneData = sceneManager.init();
  
  // Initialize physics
  const physicsData = await physicsManager.init();
  
  // Initialize other managers
  groundManager = new GroundManager(sceneData.scene, physicsData.world, physicsData.A, CFG);
  visualizationManager = { 
    obbGroup: createOBBVisualization(THREE, sceneData.scene).obbGroup,
    contactPointsGroup: createContactVisualization(THREE, CFG).contactPointsGroup,
    geomMeanMarker: createContactVisualization(THREE, CFG).geomMeanMarker
  };
  sceneData.scene.add(visualizationManager.contactPointsGroup);
  sceneData.scene.add(visualizationManager.geomMeanMarker);

  stampingManager = new StampingManager(sceneData.scene, CFG);
  flowAccumulationManager = new FlowAccumulationManager(sceneData.scene, CFG, THREE);

  // Initialize ground and obstacles
  const groundData = groundManager.init();

  // Initialize other systems
  const stampingData = stampingManager.init();
  const flowAccumulationData = flowAccumulationManager.init();
  
  // Initialize core managers
  const loader = new GLTFLoader();
  const mass = 2;
  bodyManager = new BodyManager(THREE, physicsData.A, sceneData.scene, physicsData.world, mass, CFG, loader, generateRandomCubeTexture);
  pipManager = new PiPManager(CFG, THREE, sceneData.renderer, sceneData.scene);
  uiManager = new UIManager();
  animationManager = new AnimationManager(
    sceneData.scene,
    sceneData.camera,
    sceneData.renderer,
    bodyManager,
    pipManager,
    visualizationManager,
    stampingManager
  );
  
  // Make everything globally accessible FIRST
  window.A = physicsData.A;
  window.CFG = CFG;
  window.state = state;
  window.bodyManager = bodyManager;
  window.pipManager = pipManager;
  window.uiManager = uiManager;
  window.animationManager = animationManager;
  window.sceneManager = sceneManager;
  window.physicsManager = physicsManager;
  window.groundManager = groundManager;
  window.visualizationManager = visualizationManager;
  window.stampingManager = stampingManager;
  window.flowAccumulationManager = flowAccumulationManager;
  window.world = physicsData.world;
  window.dispatcher = physicsData.dispatcher;
  window.scene = sceneData.scene;
  window.camera = sceneData.camera;
  window.renderer = sceneData.renderer;
  window.controls = sceneData.controls;
  window.ground = groundData.ground;
  window.wallObstacleMesh = groundData.wallObstacleMesh;
  window.wallObstacleBody = groundData.wallObstacleBody;
  window.MIN_CONTACTS_FOR_STABLE_BOX = MIN_CONTACTS_FOR_STABLE_BOX;
  window.ANGLE_STABILITY_THRESHOLD = ANGLE_STABILITY_THRESHOLD;
  window.softGroundThreshold = softGroundThreshold;
  window.saveCanvasAsPNG = saveCanvasAsPNG;
  window.sampleContacts = sampleContacts;
  window.computeBoundingBox = computeBoundingBox;

  // Initialize simulation control variables
  window.subStepping = state.subStepping;
  window.stepCounter = state.stepCounter;
  window.singleStep = false;

  // Setup UI AFTER all globals are available
  uiManager.initializeEventListeners();
  uiManager.initializeCollapsibleSections();
  
  // Start simulation
  bodyManager.start();
  animationManager.start();
}

// ======= Start Application =======
init().catch(err => {});