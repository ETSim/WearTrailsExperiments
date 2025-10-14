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
import { saveCanvasAsPNG, hasPixelContent, sanitizePhysicsValue, sanitizeVector3 } from './utils.js';
import { GroundVariantManager } from './managers/ground-variant-manager.js';

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
    this.groundBody = null;
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
    this.groundBody = new this.A.btRigidBody(gInfo);
    this.groundBody.setFriction(0.5);
    this.groundBody.setRestitution(0.6);
    this.groundBody.setRollingFriction(0.1);
    this.world.addRigidBody(this.groundBody);

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
      groundBody: this.groundBody,
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


// ======= Flow & Wear Accumulation Manager Class =======
class FlowAccumulationManager {
  constructor(scene, CFG, THREE) {
    this.scene = scene;
    this.CFG = CFG;
    this.THREE = THREE;
    this.flowCanvas = null;
    this.flowCtx = null;
    this.flowTexture = null;
    this.flowOverlay = null;

    // Ground size tracking (defaults to PLANE_SIZE, updated when variant ground loads)
    this.groundSize = CFG.PLANE_SIZE;

    // RGB-Encoded Wear Component Maps
    this.velocityMap = null;           // R channel: velocity magnitude (instantaneous)
    this.tractionMap = null;           // G channel: traction force (instantaneous)
    this.slidingDistanceMap = null;    // B channel: global sliding distance (accumulated)

    // Tracking maximums for each component
    this.maxVelocity = 0;
    this.maxTraction = 0;
    this.maxSlidingDistance = 0;

    // Normalization parameters for RGB encoding
    this.normParams = {
      maxVelocity: 2.0,      // m/s
      maxTraction: 20.0,     // N
      maxSliding: 10.0       // m
    };

    // Legacy accumulators (kept for compatibility)
    this.flowDirX = null;              // Flow direction X component
    this.flowDirZ = null;              // Flow direction Z component
    this.directionSaturation = null;   // Directional consistency (0-1)
    this.wearAccumulation = null;      // Accumulated wear: K × traction × velocity

    // Parameters - Energy Dissipation Model
    this.K = 0.15;           // Wear coefficient (dimensionless) - controls accumulation rate
    this.density = 1.0;      // kg/m² - surface density
    this.cosineSimilarityThreshold = 0.7;  // Direction consistency threshold
    this.saturationGrowthRate = 0.05;      // How fast saturation increases
    this.minSaturation = 0.01;             // Starting saturation value
    // Note: Friction coefficient (μ) is taken from window.bodyManager.friction

    // Timestep tracking for sliding distance calculation
    this.lastAccumulateTime = 0;  // Track time between accumulations
    this.currentTimestep = 0;      // Current δt in seconds
    this.maxTimestep = 1.0;        // Safety cap: max 1 second timestep

    // Display mode for wear visualization
    this.displayMode = 'hsva'; // 'hsva', 'rgb', or 'thermal'
  }

  init() {
    // Flow accumulation canvas (same resolution as stamps)
    this.flowCanvas = document.createElement('canvas');
    this.flowCanvas.width = 2048;
    this.flowCanvas.height = 2048;
    this.flowCtx = this.flowCanvas.getContext('2d', { willReadFrequently: true, alpha: true });

    // Initialize RGB component maps
    const size = this.flowCanvas.width * this.flowCanvas.height;
    this.velocityMap = new Float32Array(size);
    this.tractionMap = new Float32Array(size);
    this.slidingDistanceMap = new Float32Array(size);

    // Initialize legacy accumulators
    this.flowDirX = new Float32Array(size);
    this.flowDirZ = new Float32Array(size);
    this.directionSaturation = new Float32Array(size);
    this.wearAccumulation = new Float32Array(size);

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
        opacity: 0.9,
        side: this.THREE.FrontSide,
        depthWrite: false,
        depthTest: false,
        blending: this.THREE.NormalBlending
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
   * Update flow overlay size to match variant ground
   * @param {number} size - World size of the ground plane
   */
  setGroundSize(size) {
    this.groundSize = size;
    if (this.flowOverlay) {
      // Update geometry to match new size
      this.flowOverlay.geometry.dispose();
      this.flowOverlay.geometry = new this.THREE.PlaneGeometry(size, size);
      console.log(`Updated flow overlay size to ${size}x${size}`);
    }
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
   * Check if pixel has content using alpha channel (more robust than RGB)
   * @param {Uint8ClampedArray} pixels - Pixel data
   * @param {number} pixelIdx - Index into pixel array (RGBA format)
   * @returns {boolean} True if pixel has content
   */
  static hasPixelContent(pixels, pixelIdx) {
    // Use alpha channel primarily, fallback to RGB for compatibility
    const alpha = pixels[pixelIdx + 3];
    if (alpha > 10) return true;
    
    // Fallback: check RGB for non-transparent pixels
    return (pixels[pixelIdx] | pixels[pixelIdx+1] | pixels[pixelIdx+2]) > 10;
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
   * Accumulate energy dissipation wear at stamping location
   * Wear = K × (Tangential Traction × Tangential Velocity × Timestep)
   * Wear = K × (μ × σ_n × v_tangential × δt)
   *
   * NOTE: NO DECAY - Wear accumulates permanently until manually cleared
   * This creates a persistent history of all contact events
   *
   * @param {number} timestep - Time elapsed since last accumulation in seconds (δt)
   */
  accumulate(pixels1, pixels2, velocity, angularVelocity, normalForceValue, lastOBB, stampWorldX, stampWorldZ, timestep = 0) {
    if (!velocity || !lastOBB) return;

    // Validate and cap timestep for numerical stability
    let dt = timestep;
    if (dt <= 0 || dt > this.maxTimestep) {
      console.warn(`Invalid timestep ${dt}s - capping to ${this.maxTimestep}s`);
      dt = Math.min(this.maxTimestep, Math.max(0.001, dt)); // Min 1ms, max 1s
    }

    // Store current timestep for debugging/display
    this.currentTimestep = dt;

    // Update UI with timestep
    const stampTimestepEl = document.getElementById('stampTimestep');
    if (stampTimestepEl) {
      stampTimestepEl.textContent = `${(dt * 1000).toFixed(1)} ms`;
    }

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

    // Contact plane normal (ground plane: pointing up) - normalized
    const normal = { x: 0, y: 1, z: 0 };
    const normalMag = Math.sqrt(normal.x * normal.x + normal.y * normal.y + normal.z * normal.z);
    if (normalMag > 1e-9) {
      normal.x /= normalMag;
      normal.y /= normalMag;
      normal.z /= normalMag;
    }

    // Calculate stamp size
    const paddedWidth = width * window.state.paddingWidthScale;
    const paddedHeight = height * window.state.paddingHeightScale;
    const stampSizeWorld = Math.max(paddedWidth, paddedHeight);

    // FIRST PASS: Count intersection pixels and calculate contact area
    let intersectionPixelCount = 0;
    for (let y = 0; y < H_pip; y++) {
      for (let x = 0; x < W_pip; x++) {
        const pipIdx = (y * W_pip + x) * 4;
        const has1 = hasPixelContent(pixels1, pipIdx);
        const has2 = hasPixelContent(pixels2, pipIdx);
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

        // Check if pixel is in intersection using alpha-aware detection
        const has1 = hasPixelContent(pixels1, pipIdx);
        const has2 = hasPixelContent(pixels2, pipIdx);

        if (has1 && has2) {
          // Convert PiP pixel to world space (relative to OBB center)
          const u = (x / W_pip) - 0.5;
          const v = (y / H_pip) - 0.5;

          const worldX = center.x + u * width * e1.x + v * height * e2.x;
          const worldZ = center.z + u * width * e1.z + v * height * e2.z;

          /**
           * COORDINATE SPACE HIERARCHY & VELOCITY TRANSFORMATIONS
           * ====================================================
           *
           * Transformation Chain:
           * 1. OBJECT/LOCAL SPACE → [Ammo.js Transform] → WORLD SPACE
           * 2. WORLD SPACE → [OBB e1, e2 axes] → OBB LOCAL SPACE
           * 3. OBB LOCAL SPACE → [Projection] → GROUND PLANE SPACE
           *
           * Velocity Frame-Dependence:
           * - Linear velocity (v): Frame-dependent, retrieved in WORLD SPACE
           * - Angular velocity (ω): Frame-dependent, retrieved in WORLD SPACE
           * - Angular momentum (L = I × ω): Frame-dependent, computed in WORLD SPACE
           * - Position vectors (r): Calculated in WORLD SPACE from OBB center
           *
           * Key Formula: v_point = v_translational + ω × r
           * - All terms must be in same coordinate space (WORLD SPACE here)
           * - Δx = v × δt (displacement = velocity × timestep)
           * - ΔL = τ × δt (angular momentum change = torque × timestep)
           */

          // Position vector from center (WORLD SPACE)
          const r = {
            x: worldX - center.x,
            y: 0,
            z: worldZ - center.z
          };

          // Calculate rotational velocity: v_rot = ω × r (WORLD SPACE)
          // For rotating bodies: different points have different velocities
          // Velocity increases linearly with distance from rotation axis
          let v_rot = { x: 0, y: 0, z: 0 };
          if (angularVelocity) {
            v_rot = this.crossProduct(angularVelocity, r);
          }

          // Total 3D velocity at contact point (WORLD SPACE)
          // v_total = v_translational + v_rotational
          const v_3d = {
            x: velocity.x + v_rot.x,
            y: v_rot.y,
            z: velocity.z + v_rot.z
          };

          // Project to tangent plane (remove normal component)
          // v_tangential = v - (v · n) * n
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

          // Validate sliding distance for numerical stability
          const slidingDist = velMag * dt;

          // Track maximum sliding distance for UI display
          if (slidingDist > this.maxSlidingDistance) {
            this.maxSlidingDistance = slidingDist;

            // Update UI
            const maxSlidingDistEl = document.getElementById('maxSlidingDist');
            if (maxSlidingDistEl) {
              maxSlidingDistEl.textContent = `${slidingDist.toFixed(3)} m`;
            }
          }

          // Track but don't log high sliding distances to avoid console spam
          // (High values are normal during fast rotation: v = ω × r)

          if (velMag > 0.01) {
            // Map world coordinates to ground canvas coordinates (floating point)
            // Use this.groundSize instead of CFG.PLANE_SIZE to support variant ground scaling
            const canvasXf = ((worldX + this.groundSize / 2) / this.groundSize) * W_canvas;
            const canvasYf = ((worldZ + this.groundSize / 2) / this.groundSize) * H_canvas;

            // Bilinear splatting coordinates
            const x0 = Math.floor(canvasXf);
            const y0 = Math.floor(canvasYf);
            const x1 = x0 + 1;
            const y1 = y0 + 1;

            // Bilinear weights
            const fx = canvasXf - x0;
            const fy = canvasYf - y0;
            const w00 = (1 - fx) * (1 - fy);
            const w10 = fx * (1 - fy);
            const w01 = (1 - fx) * fy;
            const w11 = fx * fy;

            // Normalize direction
            const normDirX = v_tangential.x / velMag;
            const normDirZ = v_tangential.z / velMag;

            // Energy dissipation wear formula:
            // Wear = K × Traction × Velocity
            // Wear = K × (μ × σ_n) × v_tangential

            // Get friction coefficient from physics simulation
            const mu = window.bodyManager ? window.bodyManager.friction : 0.5;

            // No wear if no friction
            if (mu <= 0) {
              continue;
            }

            // Calculate tangential traction (shear stress): τ = μ × σ_n
            const tangential_traction = mu * pressure;

            // Calculate energy dissipation (power per unit area)
            const energyDissipation = tangential_traction * velMag;

            // Sliding distance = velocity × time
            const slidingDistance = velMag * dt;

            // Base wear rate = K × traction × sliding distance
            // Wear ∝ Force × Distance = (μ × σ_n) × (v × δt)
            const wearRate = this.K * tangential_traction * slidingDistance;

            // Splat to 4 neighbors with bilinear weights
            const neighbors = [
              {x: x0, y: y0, w: w00},
              {x: x1, y: y0, w: w10},
              {x: x0, y: y1, w: w01},
              {x: x1, y: y1, w: w11}
            ];

            for (const neighbor of neighbors) {
              // Check bounds
              if (neighbor.x >= 0 && neighbor.x < W_canvas && neighbor.y >= 0 && neighbor.y < H_canvas) {
                const canvasIdx = neighbor.y * W_canvas + neighbor.x;
                const weight = neighbor.w;

                if (weight > 0.01) {
                  // Initialize saturation if first contact
                  if (this.directionSaturation[canvasIdx] === 0) {
                    this.directionSaturation[canvasIdx] = this.minSaturation;
                  }

                  // Get stored direction
                  const storedDirX = this.flowDirX[canvasIdx];
                  const storedDirZ = this.flowDirZ[canvasIdx];
                  const storedMag = Math.sqrt(storedDirX * storedDirX + storedDirZ * storedDirZ);

                  let directionMultiplier = 1.0;

                  // Calculate cosine similarity if we have an existing direction
                  if (storedMag > 0.01) {
                    const storedDirX_norm = storedDirX / storedMag;
                    const storedDirZ_norm = storedDirZ / storedMag;

                    // Cosine similarity: dot product of normalized vectors
                    const cosineSimilarity = normDirX * storedDirX_norm + normDirZ * storedDirZ_norm;

                    if (cosineSimilarity >= this.cosineSimilarityThreshold) {
                      // Consistent direction → reinforce wear (1.0 to 3.0x multiplier)
                      directionMultiplier = 1.0 + this.directionSaturation[canvasIdx] * 2.0;

                      // Increase saturation for next time
                      this.directionSaturation[canvasIdx] = Math.min(1.0,
                        this.directionSaturation[canvasIdx] + this.saturationGrowthRate
                      );
                    } else {
                      // Direction changed → reset saturation
                      this.directionSaturation[canvasIdx] = this.minSaturation;
                    }
                  }

                  // Apply direction multiplier and bilinear weight to wear
                  const finalWearRate = wearRate * directionMultiplier * weight;
                  this.wearAccumulation[canvasIdx] += finalWearRate;

                  // RGB Component Storage (for separate extraction)
                  // R channel: Velocity magnitude (instantaneous, not accumulated)
                  this.velocityMap[canvasIdx] = velMag;
                  
                  // G channel: Traction force (instantaneous, not accumulated)
                  this.tractionMap[canvasIdx] = tangential_traction;
                  
                  // B channel: Sliding distance (accumulated over time)
                  this.slidingDistanceMap[canvasIdx] += slidingDistance * weight;

                  // Track maximums for each component
                  if (velMag > this.maxVelocity) this.maxVelocity = velMag;
                  if (tangential_traction > this.maxTraction) this.maxTraction = tangential_traction;
                  if (this.slidingDistanceMap[canvasIdx] > this.maxSlidingDistance) {
                    this.maxSlidingDistance = this.slidingDistanceMap[canvasIdx];
                  }

                  // Update direction (weighted blend)
                  const blendFactor = finalWearRate / (this.wearAccumulation[canvasIdx] + finalWearRate);
                  this.flowDirX[canvasIdx] = this.flowDirX[canvasIdx] * (1 - blendFactor) + normDirX * blendFactor;
                  this.flowDirZ[canvasIdx] = this.flowDirZ[canvasIdx] * (1 - blendFactor) + normDirZ * blendFactor;
                }
              }
            }
          }
        }
      }
    }
  }

  /**
   * Render wear map with multiple display modes
   * - HSVA: Direction + Wear with reinforcement
   * - RGB: Component encoding
   * - Thermal: Wear intensity only
   */
  render() {
    const W = this.flowCanvas.width;
    const H = this.flowCanvas.height;

    // Create output image
    const outputData = this.flowCtx.createImageData(W, H);
    const pixels = outputData.data;

    if (this.displayMode === 'hsva') {
      // HSVA Mode: Direction + Wear with reinforcement
      // Find max wear for normalization
      let maxWear = 0.01;
      for (let i = 0; i < this.wearAccumulation.length; i++) {
        if (this.wearAccumulation[i] > maxWear) {
          maxWear = this.wearAccumulation[i];
        }
      }

      for (let i = 0; i < this.wearAccumulation.length; i++) {
        const pixelIdx = i * 4;
        const wear = this.wearAccumulation[i];

        if (wear > 0.001) {
          // Get flow direction
          const dirX = this.flowDirX[i];
          const dirZ = this.flowDirZ[i];

          // Calculate angle for hue (0-360°)
          const angle = Math.atan2(dirZ, dirX);
          const hue = (angle + Math.PI) / (2 * Math.PI); // 0-1

          // Saturation = directional consistency (reinforcement)
          const saturation = Math.max(this.minSaturation, this.directionSaturation[i]);

          // Value = wear intensity
          const value = Math.min(1.0, wear / maxWear);

          // Convert HSV to RGB
          const [r, g, b] = this.hsvToRgb(hue, saturation, value);

          // Write RGBA
          pixels[pixelIdx] = r;
          pixels[pixelIdx + 1] = g;
          pixels[pixelIdx + 2] = b;
          pixels[pixelIdx + 3] = Math.round(value * 255);
        } else {
          pixels[pixelIdx] = 0;
          pixels[pixelIdx + 1] = 0;
          pixels[pixelIdx + 2] = 0;
          pixels[pixelIdx + 3] = 0;
        }
      }
    } else if (this.displayMode === 'rgba') {
      // RGBA Mode: Store all 4 components
      for (let i = 0; i < this.velocityMap.length; i++) {
        const pixelIdx = i * 4;
        
        // Normalize components
        const normVel = Math.min(1.0, this.velocityMap[i] / this.normParams.maxVelocity);
        const normTraction = Math.min(1.0, this.tractionMap[i] / this.normParams.maxTraction);
        const normSliding = Math.min(1.0, this.slidingDistanceMap[i] / this.normParams.maxSliding);
        
        // Get direction reinforcement count
        const directionConsistency = this.directionSaturation[i];
        
        // Encode to RGBA (0-255)
        pixels[pixelIdx] = Math.round(normVel * 255);        // R: velocity
        pixels[pixelIdx + 1] = Math.round(normTraction * 255); // G: traction
        pixels[pixelIdx + 2] = Math.round(normSliding * 255);  // B: sliding
        pixels[pixelIdx + 3] = Math.round(directionConsistency * 255); // A: direction reinforcement
      }
    }

    // Render to canvas
    this.flowCtx.putImageData(outputData, 0, 0);
    this.flowTexture.needsUpdate = true;
  }

  /**
   * Calculate wear intensity from RGB components
   * Wear = Velocity × Traction × Sliding Distance
   */
  getWearIntensity(canvasIdx) {
    const normVel = Math.min(1.0, this.velocityMap[canvasIdx] / this.normParams.maxVelocity);
    const normTraction = Math.min(1.0, this.tractionMap[canvasIdx] / this.normParams.maxTraction);
    const normSliding = Math.min(1.0, this.slidingDistanceMap[canvasIdx] / this.normParams.maxSliding);
    
    // Wear = velocity × traction × sliding distance
    return normVel * normTraction * normSliding;
  }

  /**
   * Generate wear blend texture (grayscale) for variant ground blending
   * Returns a Three.js texture with wear intensity as grayscale
   */
  generateWearBlendTexture(THREE) {
    const W = this.flowCanvas.width;
    const H = this.flowCanvas.height;

    // Create blend texture canvas
    const blendCanvas = document.createElement('canvas');
    blendCanvas.width = W;
    blendCanvas.height = H;
    const blendCtx = blendCanvas.getContext('2d');

    // Create image data
    const blendData = blendCtx.createImageData(W, H);

    for (let i = 0; i < this.flowDirX.length; i++) {
      const idx = i * 4;
      const dirX = this.flowDirX[i];
      const dirZ = this.flowDirZ[i];

      // Calculate direction magnitude
      const mag = Math.sqrt(dirX * dirX + dirZ * dirZ);

      if (mag > 0.01) {
        // Normalize direction
        const normDirX = dirX / mag;
        const normDirZ = dirZ / mag;

        // Map from [-1, 1] to [0, 255]
        const r = Math.round((normDirX * 0.5 + 0.5) * 255);
        const g = Math.round((normDirZ * 0.5 + 0.5) * 255);

        flowData.data[idx] = r;
        flowData.data[idx + 1] = g;
        flowData.data[idx + 2] = 128; // Unused, set to middle value
        flowData.data[idx + 3] = Math.min(255, Math.round(mag * 255)); // Alpha = magnitude
      } else {
        // No flow direction
        flowData.data[idx] = 128; // Middle value (no direction)
        flowData.data[idx + 1] = 128;
        flowData.data[idx + 2] = 128;
        flowData.data[idx + 3] = 0; // Transparent
      }
    }

    flowCtx.putImageData(flowData, 0, 0);

    // Create Three.js texture
    const flowTexture = new THREE.CanvasTexture(flowCanvas);
    flowTexture.colorSpace = THREE.NoColorSpace;
    flowTexture.wrapS = THREE.ClampToEdgeWrapping;
    flowTexture.wrapT = THREE.ClampToEdgeWrapping;
    flowTexture.minFilter = THREE.LinearFilter;
    flowTexture.magFilter = THREE.LinearFilter;

    return flowTexture;
  }

  /**
   * Generate grayscale blend map texture from wear accumulation
   * Returns normalized wear intensity (0-1) as grayscale for variant blending
   */
  generateWearBlendTexture(THREE) {
    const W = this.flowCanvas.width;
    const H = this.flowCanvas.height;

    // Find max wear for normalization
    let maxWear = 0.01;
    for (let i = 0; i < this.wearAccumulation.length; i++) {
      if (this.wearAccumulation[i] > maxWear) {
        maxWear = this.wearAccumulation[i];
      }
    }

    // Create blend map canvas
    const blendCanvas = document.createElement('canvas');
    blendCanvas.width = W;
    blendCanvas.height = H;
    const blendCtx = blendCanvas.getContext('2d');

    // Create image data
    const blendData = blendCtx.createImageData(W, H);

    for (let i = 0; i < this.wearAccumulation.length; i++) {
      const idx = i * 4;
      const wear = this.wearAccumulation[i];

      // Normalize to 0-1 range
      const normalizedWear = Math.min(1.0, wear / maxWear);

      // Grayscale: 0 (black) = no wear, 255 (white) = max wear
      const grayValue = Math.round(normalizedWear * 255);

      blendData.data[idx] = grayValue;
      blendData.data[idx + 1] = grayValue;
      blendData.data[idx + 2] = grayValue;
      blendData.data[idx + 3] = 255; // Full opacity
    }

    blendCtx.putImageData(blendData, 0, 0);

    // Create Three.js texture
    const blendTexture = new THREE.CanvasTexture(blendCanvas);
    blendTexture.colorSpace = THREE.NoColorSpace;
    blendTexture.wrapS = THREE.ClampToEdgeWrapping;
    blendTexture.wrapT = THREE.ClampToEdgeWrapping;
    blendTexture.minFilter = THREE.LinearFilter;
    blendTexture.magFilter = THREE.LinearFilter;

    return blendTexture;
  }

  /**
   * Get wear accumulation texture for use as blend map
   * Deprecated: Use generateWearBlendTexture() for variant blending
   */
  getWearBlendTexture() {
    return this.flowTexture;
  }

  /**
   * Splat pip6 accumulated wear onto ground canvas
   * Takes pip6's 256x256 accumulated wear data and maps it to ground coordinates
   */
  splatPip6Wear(pip6WearData, pip6DirectionX, pip6DirectionZ, pip6Width, pip6Height, lastOBB, stampWorldX, stampWorldZ) {
    if (!lastOBB || !pip6WearData) return;

    const W_pip = pip6Width;
    const H_pip = pip6Height;
    const W_canvas = this.flowCanvas.width;
    const H_canvas = this.flowCanvas.height;

    // Get OBB parameters
    const center = lastOBB.center;
    const width = lastOBB.width;
    const height = lastOBB.height;
    const e1 = lastOBB.e1;
    const e2 = lastOBB.e2;

    // Process each pixel in pip6 canvas
    for (let y = 0; y < H_pip; y++) {
      for (let x = 0; x < W_pip; x++) {
        const pipIdx = y * W_pip + x;

        // Get pip6 accumulated wear at this pixel
        const wearValue = pip6WearData[pipIdx];

        if (wearValue > 0.001) {
          // Convert PiP pixel to world space (relative to OBB center)
          const u = (x / W_pip) - 0.5;
          const v = (y / H_pip) - 0.5;

          const worldX = center.x + u * width * e1.x + v * height * e2.x;
          const worldZ = center.z + u * width * e1.z + v * height * e2.z;

          // Map world coordinates to ground canvas coordinates
          // Use this.groundSize instead of CFG.PLANE_SIZE to support variant ground scaling
          const canvasX = Math.round(((worldX + this.groundSize / 2) / this.groundSize) * W_canvas);
          const canvasY = Math.round(((worldZ + this.groundSize / 2) / this.groundSize) * H_canvas);

          // Check bounds
          if (canvasX >= 0 && canvasX < W_canvas && canvasY >= 0 && canvasY < H_canvas) {
            const canvasIdx = canvasY * W_canvas + canvasX;

            // Add pip6 wear to ground accumulation (scaled by flowAlpha for consistency)
            this.wearAccumulation[canvasIdx] += wearValue * this.flowAlpha;
            this.energyWearAccumulation[canvasIdx] += wearValue * this.flowAlpha;

            // Transfer direction data from pip6
            const dirX = pip6DirectionX[pipIdx];
            const dirZ = pip6DirectionZ[pipIdx];

            const dirMag = Math.sqrt(dirX * dirX + dirZ * dirZ);

            if (dirMag > 0.01) {
              // Normalize direction
              const normDirX = dirX / dirMag;
              const normDirZ = dirZ / dirMag;

              // Update ground direction (weighted blend)
              const currentDirMag = Math.sqrt(
                this.flowDirX[canvasIdx] * this.flowDirX[canvasIdx] +
                this.flowDirZ[canvasIdx] * this.flowDirZ[canvasIdx]
              );

              if (currentDirMag < 0.01) {
                // First direction - just set it
                this.flowDirX[canvasIdx] = normDirX;
                this.flowDirZ[canvasIdx] = normDirZ;
              } else {
                // Blend with existing direction (weighted by wear contribution)
                const totalWear = this.wearAccumulation[canvasIdx];
                const blendFactor = (wearValue * this.flowAlpha) / totalWear;
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
   * Clear all accumulated wear data
   * NOTE: This is the ONLY way to remove wear - there is NO automatic decay
   * Wear accumulates permanently until this method is called
   */
  clearFlow() {
    // Reset RGB component maps
    this.velocityMap.fill(0);
    this.tractionMap.fill(0);
    this.slidingDistanceMap.fill(0);

    // Reset maximums
    this.maxVelocity = 0;
    this.maxTraction = 0;
    this.maxSlidingDistance = 0;

    // Reset legacy accumulators
    this.flowDirX.fill(0);
    this.flowDirZ.fill(0);
    this.directionSaturation.fill(0);
    this.wearAccumulation.fill(0);

    // Reset max sliding distance tracker
    const maxSlidingDistEl = document.getElementById('maxSlidingDist');
    if (maxSlidingDistEl) {
      maxSlidingDistEl.textContent = '—';
    }

    // Clear canvas
    this.flowCtx.clearRect(0, 0, this.flowCanvas.width, this.flowCanvas.height);
    this.flowTexture.needsUpdate = true;

    console.log('Wear data cleared - all RGB components reset to zero');
  }
}


// ======= Sliding Distance Accumulation Manager Class =======
class SlidingDistanceManager {
  constructor(scene, CFG, THREE) {
    this.scene = scene;
    this.CFG = CFG;
    this.THREE = THREE;

    // Ground size tracking (defaults to PLANE_SIZE, updated when variant ground loads)
    this.groundSize = CFG.PLANE_SIZE;

    // Sliding distance coefficient
    this.K = 0.15;

    // Canvas for accumulated sliding distance
    this.slidingCanvas = null;
    this.slidingCtx = null;
    this.slidingTexture = null;
    this.slidingOverlay = null;

    // Accumulators (2048x2048)
    this.accumulatedSlidingDistance = null;
    this.maxSlidingDistance = 0;
  }

  init() {
    // Sliding distance canvas (2048x2048, same as wear/stamps)
    this.slidingCanvas = document.createElement('canvas');
    this.slidingCanvas.width = 2048;
    this.slidingCanvas.height = 2048;
    this.slidingCtx = this.slidingCanvas.getContext('2d', { willReadFrequently: true, alpha: true });

    // Initialize accumulators
    const size = this.slidingCanvas.width * this.slidingCanvas.height;
    this.accumulatedSlidingDistance = new Float32Array(size);

    // Clear canvas
    this.slidingCtx.clearRect(0, 0, 2048, 2048);

    // Create texture
    this.slidingTexture = new this.THREE.CanvasTexture(this.slidingCanvas);
    this.slidingTexture.wrapS = this.THREE.ClampToEdgeWrapping;
    this.slidingTexture.wrapT = this.THREE.ClampToEdgeWrapping;
    this.slidingTexture.minFilter = this.THREE.LinearFilter;
    this.slidingTexture.magFilter = this.THREE.LinearFilter;

    // Sliding distance overlay on ground
    this.slidingOverlay = new this.THREE.Mesh(
      new this.THREE.PlaneGeometry(this.CFG.PLANE_SIZE, this.CFG.PLANE_SIZE),
      new this.THREE.MeshBasicMaterial({
        map: this.slidingTexture,
        color: 0xffffff,
        transparent: true,
        opacity: 0.9,
        side: this.THREE.FrontSide,
        depthWrite: false,
        depthTest: false,
        blending: this.THREE.NormalBlending
      })
    );
    this.slidingOverlay.rotation.x = -Math.PI / 2;
    this.slidingOverlay.position.y = 0.05; // Above wear layer
    this.slidingOverlay.receiveShadow = false;
    this.slidingOverlay.castShadow = false;
    this.slidingOverlay.visible = false;
    this.slidingOverlay.renderOrder = 1000;
    this.scene.add(this.slidingOverlay);

    return {
      slidingCanvas: this.slidingCanvas,
      slidingCtx: this.slidingCtx,
      slidingTexture: this.slidingTexture,
      slidingOverlay: this.slidingOverlay
    };
  }

  /**
   * Update overlay size to match variant ground
   */
  setGroundSize(size) {
    this.groundSize = size;
    if (this.slidingOverlay) {
      this.slidingOverlay.geometry.dispose();
      this.slidingOverlay.geometry = new this.THREE.PlaneGeometry(size, size);
      console.log(`Updated sliding distance overlay size to ${size}x${size}`);
    }
  }

  /**
   * Accumulate sliding distance from PiP contact region
   * Tracks total distance traveled by each point on the ground
   */
  accumulate(pixels1, pixels2, velocity, angularVelocity, lastOBB, timestep = 0) {
    if (!velocity || !lastOBB || timestep <= 0) return;

    const W_pip = this.CFG.PIP_W;
    const H_pip = this.CFG.PIP_H;
    const W_canvas = this.slidingCanvas.width;
    const H_canvas = this.slidingCanvas.height;

    const center = lastOBB.center;
    const n = new this.THREE.Vector3(lastOBB.n.x, lastOBB.n.y, lastOBB.n.z).normalize();
    const e1 = new this.THREE.Vector3(lastOBB.e1.x, lastOBB.e1.y, lastOBB.e1.z).normalize();
    const e2 = new this.THREE.Vector3().crossVectors(n, e1).normalize();

    const width = lastOBB.width;
    const height = lastOBB.height;

    // Get ground velocity (relative motion)
    let groundVelocity = { x: 0, y: 0, z: 0 };
    let groundAngularVelocity = { x: 0, y: 0, z: 0 };
    
    if (window.groundManager && window.groundManager.groundBody) {
      try {
        const gv = window.groundManager.groundBody.getLinearVelocity();
        groundVelocity = { x: gv.x(), y: gv.y(), z: gv.z() };
        window.A.destroy(gv);
        
        const gav = window.groundManager.groundBody.getAngularVelocity();
        groundAngularVelocity = { x: gav.x(), y: gav.y(), z: gav.z() };
        window.A.destroy(gav);
      } catch (e) {
        // Ground is static, velocities remain zero
      }
    }

    // Process each pixel in PiP intersection
    for (let y = 0; y < H_pip; y++) {
      for (let x = 0; x < W_pip; x++) {
        const pixelIdx = (y * W_pip + x) * 4;

        // Check if pixel has content (intersection from both views)
        const hasContent = (pixels1[pixelIdx + 3] > 10) && (pixels2[pixelIdx + 3] > 10);
        if (!hasContent) continue;

        // Convert pixel to world coordinates
        const u = (x / W_pip) - 0.5;
        const v = (y / H_pip) - 0.5;

        const worldX = center.x + u * width * e1.x + v * height * e2.x;
        const worldZ = center.z + u * width * e1.z + v * height * e2.z;

        // Position vector from center (for object rotation)
        const r = {
          x: worldX - center.x,
          y: 0,
          z: worldZ - center.z
        };

        // Object rotational velocity: v_rot_obj = ω_obj × r
        let v_rot_obj = { x: 0, y: 0, z: 0 };
        if (angularVelocity) {
          v_rot_obj.x = angularVelocity.y * r.z - angularVelocity.z * r.y;
          v_rot_obj.y = angularVelocity.z * r.x - angularVelocity.x * r.z;
          v_rot_obj.z = angularVelocity.x * r.y - angularVelocity.y * r.x;
        }

        // Ground rotational velocity at this point
        const r_ground = { x: worldX, y: 0, z: worldZ };
        let v_rot_ground = { x: 0, y: 0, z: 0 };
        v_rot_ground.x = groundAngularVelocity.y * r_ground.z - groundAngularVelocity.z * r_ground.y;
        v_rot_ground.y = groundAngularVelocity.z * r_ground.x - groundAngularVelocity.x * r_ground.z;
        v_rot_ground.z = groundAngularVelocity.x * r_ground.y - groundAngularVelocity.y * r_ground.x;

        // Object total velocity
        const v_obj = {
          x: velocity.x + v_rot_obj.x,
          y: velocity.y + v_rot_obj.y,
          z: velocity.z + v_rot_obj.z
        };

        // Ground total velocity
        const v_ground = {
          x: groundVelocity.x + v_rot_ground.x,
          y: groundVelocity.y + v_rot_ground.y,
          z: groundVelocity.z + v_rot_ground.z
        };

        // Relative velocity (object - ground)
        const v_3d = {
          x: v_obj.x - v_ground.x,
          y: v_obj.y - v_ground.y,
          z: v_obj.z - v_ground.z
        };

        // Project to tangent plane (remove normal component)
        const v_dot_n = v_3d.x * n.x + v_3d.y * n.y + v_3d.z * n.z;
        const v_tangential = {
          x: v_3d.x - v_dot_n * n.x,
          y: v_3d.y - v_dot_n * n.y,
          z: v_3d.z - v_dot_n * n.z
        };

        const velMag = Math.sqrt(
          v_tangential.x * v_tangential.x +
          v_tangential.y * v_tangential.y +
          v_tangential.z * v_tangential.z
        );

        if (velMag > 0.01) {
          // Sliding distance = velocity magnitude × timestep × K factor
          const slidingDist = this.K * velMag * timestep;

          // Map world coordinates to ground canvas coordinates (bilinear splatting)
          const canvasXf = ((worldX + this.groundSize / 2) / this.groundSize) * W_canvas;
          const canvasYf = ((worldZ + this.groundSize / 2) / this.groundSize) * H_canvas;

          // Bilinear splatting coordinates
          const x0 = Math.floor(canvasXf);
          const y0 = Math.floor(canvasYf);
          const x1 = x0 + 1;
          const y1 = y0 + 1;
          const fx = canvasXf - x0;
          const fy = canvasYf - y0;

          // Bilinear weights
          const w00 = (1 - fx) * (1 - fy);
          const w10 = fx * (1 - fy);
          const w01 = (1 - fx) * fy;
          const w11 = fx * fy;

          const neighbors = [
            { x: x0, y: y0, w: w00 },
            { x: x1, y: y0, w: w10 },
            { x: x0, y: y1, w: w01 },
            { x: x1, y: y1, w: w11 }
          ];

          // Accumulate to all 4 neighbors with weights
          for (const neighbor of neighbors) {
            if (neighbor.x >= 0 && neighbor.x < W_canvas && neighbor.y >= 0 && neighbor.y < H_canvas) {
              const canvasIdx = neighbor.y * W_canvas + neighbor.x;
              const weightedDistance = slidingDist * neighbor.w;
              
              this.accumulatedSlidingDistance[canvasIdx] += weightedDistance;
              
              if (this.accumulatedSlidingDistance[canvasIdx] > this.maxSlidingDistance) {
                this.maxSlidingDistance = this.accumulatedSlidingDistance[canvasIdx];
              }
            }
          }
        }
      }
    }
  }

  /**
   * Render accumulated sliding distance to canvas
   */
  render() {
    const W = this.slidingCanvas.width;
    const H = this.slidingCanvas.height;
    const imageData = this.slidingCtx.createImageData(W, H);
    const pixels = imageData.data;

    // Render with thermal colormap
    for (let i = 0; i < this.accumulatedSlidingDistance.length; i++) {
      const distance = this.accumulatedSlidingDistance[i];
      const pixelIdx = i * 4;

      if (distance > 0 && this.maxSlidingDistance > 0) {
        const normalized = Math.min(1.0, distance / this.maxSlidingDistance);
        const color = this.thermalColor(normalized);
        pixels[pixelIdx] = color.r;
        pixels[pixelIdx + 1] = color.g;
        pixels[pixelIdx + 2] = color.b;
        pixels[pixelIdx + 3] = 255;
      } else {
        pixels[pixelIdx] = 0;
        pixels[pixelIdx + 1] = 0;
        pixels[pixelIdx + 2] = 0;
        pixels[pixelIdx + 3] = 0;
      }
    }

    this.slidingCtx.putImageData(imageData, 0, 0);
    this.slidingTexture.needsUpdate = true;
  }

  /**
   * Thermal colormap: black -> blue -> cyan -> yellow -> red -> white
   */
  thermalColor(t) {
    t = Math.max(0, Math.min(1, t));
    let r, g, b;

    if (t < 0.25) {
      const s = t / 0.25;
      r = 0; g = 0; b = Math.round(255 * s);
    } else if (t < 0.5) {
      const s = (t - 0.25) / 0.25;
      r = 0; g = Math.round(255 * s); b = 255;
    } else if (t < 0.75) {
      const s = (t - 0.5) / 0.25;
      r = Math.round(255 * s); g = 255; b = Math.round(255 * (1 - s));
    } else {
      const s = (t - 0.75) / 0.25;
      r = 255; g = Math.round(255 * (1 - s * 0.5)); b = 0;
    }

    return { r, g, b };
  }

  /**
   * Clear all sliding distance accumulation
   */
  clearSliding() {
    this.accumulatedSlidingDistance.fill(0);
    this.maxSlidingDistance = 0;

    // Clear canvas
    this.slidingCtx.clearRect(0, 0, this.slidingCanvas.width, this.slidingCanvas.height);
    this.slidingTexture.needsUpdate = true;

    console.log('Sliding distance cleared');
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

    // Initialize PiP visibility based on initial friction value (0)
    const initialFriction = parseFloat(document.getElementById('friction').value) || 0;
    if (initialFriction <= 0) {
      const pip4 = document.getElementById('pip4');
      const pip5 = document.getElementById('pip5');
      const pip6 = document.getElementById('pip6');
      if (pip4) pip4.style.display = 'none';
      if (pip5) pip5.style.display = 'none';
      if (pip6) pip6.style.display = 'none';
    }

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

    // Angular velocity (torque) controls
    document.getElementById('torqueX').oninput = (e) => {
      window.state.torqueX = parseInt(e.target.value);
      document.getElementById('torqueXVal').textContent = String(window.state.torqueX);
    };

    document.getElementById('torqueY').oninput = (e) => {
      window.state.torqueY = parseInt(e.target.value);
      document.getElementById('torqueYVal').textContent = String(window.state.torqueY);
    };

    document.getElementById('torqueZ').oninput = (e) => {
      window.state.torqueZ = parseInt(e.target.value);
      document.getElementById('torqueZVal').textContent = String(window.state.torqueZ);
    };

    // Apply torque button
    document.getElementById('applyTorque').onclick = () => {
      if (window.bodyManager) {
        const body = window.bodyManager.getBody();
        const mesh = window.bodyManager.getMesh();
        if (body && mesh && !mesh.userData.isSoftBody) {
          // Apply angular velocity impulse directly
          const currentAV = body.getAngularVelocity();
          const newAV = new A.btVector3(
            currentAV.x() + window.state.torqueX,
            currentAV.y() + window.state.torqueY,
            currentAV.z() + window.state.torqueZ
          );
          body.setAngularVelocity(newAV);
          body.activate();
          A.destroy(currentAV);
          console.log(`Applied angular impulse: (${window.state.torqueX}, ${window.state.torqueY}, ${window.state.torqueZ}) rad/s`);
        }
      }
    };

    // Stop rotation button
    const stopRotationEl = document.getElementById('stopRotation');
    if (stopRotationEl) {
      stopRotationEl.onclick = () => {
        if (window.bodyManager) {
          const body = window.bodyManager.getBody();
          const mesh = window.bodyManager.getMesh();
          if (body && mesh && !mesh.userData.isSoftBody) {
            const zeroAngVel = new window.A.btVector3(0, 0, 0);
            body.setAngularVelocity(zeroAngVel);
            body.activate();
            window.A.destroy(zeroAngVel);
            console.log('Rotation stopped');
          }
        }
      };
    }

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

      // Toggle PiP4, PiP5, PiP6 visibility based on friction
      const pip4 = document.getElementById('pip4');
      const pip5 = document.getElementById('pip5');
      const pip6 = document.getElementById('pip6');

      if (friction <= 0) {
        if (pip4) pip4.style.display = 'none';
        if (pip5) pip5.style.display = 'none';
        if (pip6) pip6.style.display = 'none';
      } else {
        if (pip4) pip4.style.display = '';
        if (pip5) pip5.style.display = '';
        if (pip6) pip6.style.display = '';
      }
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

    const enableSyntheticEl = document.getElementById('enableSynthetic');
    if (enableSyntheticEl) {
      enableSyntheticEl.onchange = (e) => {
        window.state.enableSynthetic = e.target.checked;
        console.log(`Synthetic augmentation ${e.target.checked ? 'enabled' : 'disabled'}`);
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

    // Wear display mode selector
    const wearDisplayModeEl = document.getElementById('wearDisplayMode');
    if (wearDisplayModeEl) {
      wearDisplayModeEl.onchange = (e) => {
        if (window.flowAccumulationManager) {
          window.flowAccumulationManager.displayMode = e.target.value;
          window.flowAccumulationManager.render(); // Re-render with new mode
          console.log(`Wear display mode changed to: ${e.target.value}`);
        }
      };
    }

    // Sliding distance overlay controls
    const showSlidingOverlayEl = document.getElementById('showSlidingOverlay');
    if (showSlidingOverlayEl) {
      showSlidingOverlayEl.onchange = (e) => {
        if (window.slidingDistanceManager && window.slidingDistanceManager.slidingOverlay) {
          window.slidingDistanceManager.slidingOverlay.visible = e.target.checked;
        }
      };
    }

    const clearSlidingDistEl = document.getElementById('clearSlidingDist');
    if (clearSlidingDistEl) {
      clearSlidingDistEl.onclick = () => {
        if (window.slidingDistanceManager) {
          window.slidingDistanceManager.clearSliding();
        }
        if (window.pipManager && window.pipManager.pip7) {
          window.pipManager.pip7.clearMagnitudes();
        }
        console.log('Sliding distance data cleared');
      };
    }

    const slidingKFactorEl = document.getElementById('slidingKFactor');
    const slidingKFactorValEl = document.getElementById('slidingKFactorVal');
    if (slidingKFactorEl && slidingKFactorValEl) {
      slidingKFactorEl.oninput = (e) => {
        const val = parseFloat(e.target.value);
        slidingKFactorValEl.textContent = val.toFixed(2);
        if (window.slidingDistanceManager) {
          window.slidingDistanceManager.K = val;
        }
      };
    }


    // Wear Coefficient (K)
    const wearKEl = document.getElementById('wearK');
    const wearKValEl = document.getElementById('wearKVal');
    if (wearKEl && wearKValEl) {
      wearKEl.oninput = (e) => {
        const val = parseFloat(e.target.value) / 100.0;
        wearKValEl.textContent = val.toFixed(2);
        if (window.flowAccumulationManager) {
          window.flowAccumulationManager.K = val;
        }
      };
    }

    // Clear wear button
    const clearWearEl = document.getElementById('clearWear');
    if (clearWearEl) {
      clearWearEl.onclick = () => {
        if (window.flowAccumulationManager) {
          window.flowAccumulationManager.clearFlow();
        }
        console.log('Wear data cleared');
      };
    }

    // ===== Wear Normalization Parameters =====
    window.wearNormParams = {
      maxVelocity: 2.0,
      maxTraction: 20.0,
      maxSliding: 10.0
    };

    // Max velocity normalization
    const maxVelocityNormEl = document.getElementById('maxVelocityNorm');
    const maxVelocityNormValEl = document.getElementById('maxVelocityNormVal');
    if (maxVelocityNormEl && maxVelocityNormValEl) {
      maxVelocityNormEl.oninput = (e) => {
        const val = parseFloat(e.target.value);
        maxVelocityNormValEl.textContent = `${val.toFixed(1)} m/s`;
        window.wearNormParams.maxVelocity = val;
        if (window.flowAccumulationManager) {
          window.flowAccumulationManager.normParams.maxVelocity = val;
        }
      };
    }

    // Max traction normalization
    const maxTractionNormEl = document.getElementById('maxTractionNorm');
    const maxTractionNormValEl = document.getElementById('maxTractionNormVal');
    if (maxTractionNormEl && maxTractionNormValEl) {
      maxTractionNormEl.oninput = (e) => {
        const val = parseFloat(e.target.value);
        maxTractionNormValEl.textContent = `${val} N`;
        window.wearNormParams.maxTraction = val;
        if (window.flowAccumulationManager) {
          window.flowAccumulationManager.normParams.maxTraction = val;
        }
      };
    }

    // Max sliding distance normalization
    const maxSlidingNormEl = document.getElementById('maxSlidingNorm');
    const maxSlidingNormValEl = document.getElementById('maxSlidingNormVal');
    if (maxSlidingNormEl && maxSlidingNormValEl) {
      maxSlidingNormEl.oninput = (e) => {
        const val = parseFloat(e.target.value);
        maxSlidingNormValEl.textContent = `${val} m`;
        window.wearNormParams.maxSliding = val;
        if (window.flowAccumulationManager) {
          window.flowAccumulationManager.normParams.maxSliding = val;
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

    // ===== Variant Ground Controls =====
    const loadGroundGLBEl = document.getElementById('loadGroundGLB');
    if (loadGroundGLBEl) {
      loadGroundGLBEl.onchange = async (e) => {
        const file = e.target.files?.[0];
        if (!file) return;

        try {
          const result = await window.groundVariantManager.loadGLB(file);

          // Update UI - count display
          const countEl = document.getElementById('variantCountDisplay');
          if (countEl) {
            countEl.textContent = result.variantCount;
          }
          
          // Update UI - variant names list
          const namesListEl = document.getElementById('variantNamesList');
          if (namesListEl && window.groundVariantManager.globalVariantNames.length > 0) {
            namesListEl.innerHTML = window.groundVariantManager.globalVariantNames
              .map((name, idx) => `<div style="font-size: 9px; color: #60a5fa;">• ${name || `Variant ${idx + 1}`}</div>`)
              .join('');
          } else if (namesListEl) {
            namesListEl.innerHTML = '<div style="font-size: 9px; color: #888;">No variant names</div>';
          }
          
          // Update variant dropdown
          const variantSelectRow = document.getElementById('variantGroundSelectRow');
          const variantSelect = document.getElementById('variantGroundSelect');
          if (variantSelectRow && variantSelect && window.groundVariantManager.globalVariantNames.length > 0) {
            variantSelect.innerHTML = '';
            window.groundVariantManager.globalVariantNames.forEach((name, idx) => {
              const option = document.createElement('option');
              option.value = idx;
              option.textContent = name || `Variant ${idx + 1}`;
              variantSelect.appendChild(option);
            });
            variantSelectRow.style.display = 'flex';
          }
          
          document.getElementById('removeVariantGround').disabled = false;

          // Connect wear texture as blend map (grayscale)
          const wearTexture = window.flowAccumulationManager.generateWearBlendTexture(THREE);
          window.groundVariantManager.setWearBlendTexture(wearTexture);

          // Hide original ground plane and remove its physics body
          if (window.groundManager) {
            if (window.groundManager.ground) {
              window.groundManager.ground.visible = false;
            }
            if (window.groundManager.groundBody && window.world) {
              window.world.removeRigidBody(window.groundManager.groundBody);
              console.log('Removed original ground physics body - using variant ground collider only');
            }
          }

          console.log(`Loaded GLB with ${result.variantCount} variants:`, window.groundVariantManager.globalVariantNames);
          
          // Update flow overlay size to match variant ground (use actual mesh size)
          if (window.flowAccumulationManager && window.groundVariantManager) {
            const variantGroundSize = window.groundVariantManager.getGroundSize();
            window.flowAccumulationManager.setGroundSize(variantGroundSize);
            console.log(`Set wear overlay size to ${variantGroundSize.toFixed(2)} units`);
          }
          
          // Update sliding distance overlay size
          if (window.slidingDistanceManager && window.groundVariantManager) {
            const variantGroundSize = window.groundVariantManager.getGroundSize();
            window.slidingDistanceManager.setGroundSize(variantGroundSize);
            console.log(`Set sliding overlay size to ${variantGroundSize.toFixed(2)} units`);
          }
        } catch (error) {
          console.error('Failed to load GLB:', error);
          const namesListEl = document.getElementById('variantNamesList');
          if (namesListEl) {
            namesListEl.innerHTML = '<div style="font-size: 9px; color: #ef4444;">Load failed</div>';
          }
        }
      };
    }

    const removeVariantGroundEl = document.getElementById('removeVariantGround');
    if (removeVariantGroundEl) {
      removeVariantGroundEl.onclick = () => {
        if (window.groundVariantManager) {
          window.groundVariantManager.remove();

          // Update UI
          const countEl = document.getElementById('variantCountDisplay');
          if (countEl) {
            countEl.textContent = '0';
          }
          
          const namesListEl = document.getElementById('variantNamesList');
          if (namesListEl) {
            namesListEl.innerHTML = '';
          }
          
          // Hide variant dropdown
          const variantSelectRow = document.getElementById('variantGroundSelectRow');
          if (variantSelectRow) {
            variantSelectRow.style.display = 'none';
          }
          
          removeVariantGroundEl.disabled = true;

          // Show original ground plane and restore its physics body
          if (window.groundManager) {
            if (window.groundManager.ground) {
              window.groundManager.ground.visible = true;
            }
            if (window.groundManager.groundBody && window.world) {
              window.world.addRigidBody(window.groundManager.groundBody);
              console.log('Restored original ground physics body');
            }
          }
          
          // Reset wear overlay to original ground size
          if (window.flowAccumulationManager && window.CFG) {
            window.flowAccumulationManager.setGroundSize(window.CFG.PLANE_SIZE);
            console.log(`Reset wear overlay to original size: ${window.CFG.PLANE_SIZE}`);
          }
          
          // Reset sliding distance overlay to original size
          if (window.slidingDistanceManager && window.CFG) {
            window.slidingDistanceManager.setGroundSize(window.CFG.PLANE_SIZE);
            console.log(`Reset sliding overlay to original size: ${window.CFG.PLANE_SIZE}`);
          }
        }
      };
    }

    // Variant Ground Scale Control
    const variantGroundScaleEl = document.getElementById('variantGroundScale');
    const variantGroundScaleValEl = document.getElementById('variantGroundScaleVal');
    if (variantGroundScaleEl && variantGroundScaleValEl) {
      variantGroundScaleEl.oninput = (e) => {
        const val = parseFloat(e.target.value) / 100.0;
        variantGroundScaleValEl.textContent = val.toFixed(2) + 'x';
        if (window.groundVariantManager) {
          window.groundVariantManager.setScale(val);
          
          // Update flow overlay size to match new scale (use actual mesh size)
          if (window.flowAccumulationManager) {
            const variantGroundSize = window.groundVariantManager.getGroundSize();
            window.flowAccumulationManager.setGroundSize(variantGroundSize);
          }
          
          // Update sliding distance overlay size to match new scale
          if (window.slidingDistanceManager) {
            const variantGroundSize = window.groundVariantManager.getGroundSize();
            window.slidingDistanceManager.setGroundSize(variantGroundSize);
          }
        }
      };
    }

    const variantSmoothnessEl = document.getElementById('variantSmoothness');
    const variantSmoothnessValEl = document.getElementById('variantSmoothnessVal');
    if (variantSmoothnessEl && variantSmoothnessValEl) {
      variantSmoothnessEl.oninput = (e) => {
        const val = parseFloat(e.target.value);
        variantSmoothnessValEl.textContent = val.toFixed(2);
        if (window.groundVariantManager) {
          window.groundVariantManager.smoothness = val;
          window.groundVariantManager.updateUniforms();
        }
      };
    }

    const variantContrastEl = document.getElementById('variantContrast');
    const variantContrastValEl = document.getElementById('variantContrastVal');
    if (variantContrastEl && variantContrastValEl) {
      variantContrastEl.oninput = (e) => {
        const val = parseFloat(e.target.value);
        variantContrastValEl.textContent = val.toFixed(2);
        if (window.groundVariantManager) {
          window.groundVariantManager.contrast = val;
          window.groundVariantManager.updateUniforms();
        }
      };
    }

    const variantInvertEl = document.getElementById('variantInvert');
    if (variantInvertEl) {
      variantInvertEl.onchange = (e) => {
        if (window.groundVariantManager) {
          window.groundVariantManager.invert = e.target.checked;
          window.groundVariantManager.updateUniforms();
        }
      };
    }

    const variantEnableFlowEl = document.getElementById('variantEnableFlow');
    if (variantEnableFlowEl) {
      variantEnableFlowEl.onchange = (e) => {
        if (window.groundVariantManager) {
          window.groundVariantManager.enableFlow = e.target.checked;
          window.groundVariantManager.updateUniforms();

          // Generate and set flow map if enabled
          if (e.target.checked && window.flowAccumulationManager) {
            const flowTexture = window.flowAccumulationManager.generateFlowMapTexture(THREE);
            window.groundVariantManager.setFlowMapTexture(flowTexture);
          }
        }
      };
    }

    const variantRotStrengthEl = document.getElementById('variantRotStrength');
    const variantRotStrengthValEl = document.getElementById('variantRotStrengthVal');
    if (variantRotStrengthEl && variantRotStrengthValEl) {
      variantRotStrengthEl.oninput = (e) => {
        const val = parseFloat(e.target.value);
        variantRotStrengthValEl.textContent = val.toFixed(0) + '°';
        if (window.groundVariantManager) {
          window.groundVariantManager.rotationStrength = val;
          window.groundVariantManager.updateUniforms();
        }
      };
    }

    const variantFlowThresholdEl = document.getElementById('variantFlowThreshold');
    const variantFlowThresholdValEl = document.getElementById('variantFlowThresholdVal');
    if (variantFlowThresholdEl && variantFlowThresholdValEl) {
      variantFlowThresholdEl.oninput = (e) => {
        const val = parseFloat(e.target.value);
        variantFlowThresholdValEl.textContent = val.toFixed(2);
        if (window.groundVariantManager) {
          window.groundVariantManager.flowThreshold = val;
          window.groundVariantManager.updateUniforms();
        }
      };
    }

    // Variant Ground Select Handler
    const variantGroundSelectEl = document.getElementById('variantGroundSelect');
    if (variantGroundSelectEl) {
      variantGroundSelectEl.onchange = (e) => {
        const variantIndex = parseInt(e.target.value);
        if (window.groundVariantManager && variantIndex >= 0) {
          window.groundVariantManager.setVariant(variantIndex);
        }
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
    const closedSubsections = ['paddingControlsDetails', 'speedControlsDetails', 'forceControlsDetails', 'physicsParametersDetails', 'variantGroundDetails'];
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
    this.lastPiPTime = 0;
    this.tmpTr = new A.btTransform();

    this.RESET_BOUNDARY = CFG.PLANE_SIZE / 2;
    this.RESET_Y_THRESHOLD = -5;

    this.contactResult = {
      count: 0,
      geometricCenter: { x: 0, z: 0 },
      avgContactPoint: { x: 0, y: 0, z: 0 },
      avgContactNormal: { x: 0, y: 1, z: 0 }
    };

    // Performance throttling for high angular velocity
    this.HIGH_ANGULAR_VEL_THRESHOLD = 10.0;  // rad/s - skip expensive calculations above this
    this.EXTREME_ANGULAR_VEL_THRESHOLD = 20.0; // rad/s - aggressive throttling
    this.expensiveCalcSkipCounter = 0;
    this.cachedContactResult = null;
    this.cachedOBB = null;
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

    // Update accumulated sliding distance displays
    const accSlidingEl = document.getElementById('accumulatedSlidingDist');
    if (accSlidingEl && window.slidingDistanceManager) {
      const maxDist = window.slidingDistanceManager.maxSlidingDistance;
      accSlidingEl.textContent = `${(maxDist * 1000).toFixed(2)} mm`;
    }

    const maxSlidingDistDisplayEl = document.getElementById('maxSlidingDistDisplay');
    if (maxSlidingDistDisplayEl && window.slidingDistanceManager) {
      const maxDist = window.slidingDistanceManager.maxSlidingDistance;
      maxSlidingDistDisplayEl.textContent = `${(maxDist * 1000).toFixed(2)} mm`;
    }

    // Update PiP timestep display
    const pipTimestepEl = document.getElementById('pipTimestep');
    if (pipTimestepEl && this.lastPiPTime > 0) {
      const dt = Math.min((now - this.lastPiPTime) / 1000, 0.1);
      pipTimestepEl.textContent = `${(dt * 1000).toFixed(2)} ms`;
    }

    // Update RGB component displays
    const currentMaxVelEl = document.getElementById('currentMaxVel');
    if (currentMaxVelEl && window.flowAccumulationManager) {
      currentMaxVelEl.textContent = `${window.flowAccumulationManager.maxVelocity.toFixed(3)} m/s`;
    }

    const currentMaxTractionEl = document.getElementById('currentMaxTraction');
    if (currentMaxTractionEl && window.flowAccumulationManager) {
      currentMaxTractionEl.textContent = `${window.flowAccumulationManager.maxTraction.toFixed(2)} N`;
    }

    const currentMaxSlidingEl = document.getElementById('currentMaxSliding');
    if (currentMaxSlidingEl && window.flowAccumulationManager) {
      currentMaxSlidingEl.textContent = `${(window.flowAccumulationManager.maxSlidingDistance * 1000).toFixed(2)} mm`;
    }

    // Calculate and display max wear (R×G×B)
    const maxWearDisplayEl = document.getElementById('maxWearDisplay');
    if (maxWearDisplayEl && window.flowAccumulationManager) {
      const normVel = Math.min(1.0, window.flowAccumulationManager.maxVelocity / window.flowAccumulationManager.normParams.maxVelocity);
      const normTr = Math.min(1.0, window.flowAccumulationManager.maxTraction / window.flowAccumulationManager.normParams.maxTraction);
      const normSl = Math.min(1.0, window.flowAccumulationManager.maxSlidingDistance / window.flowAccumulationManager.normParams.maxSliding);
      const maxWear = normVel * normTr * normSl;
      maxWearDisplayEl.textContent = `${(maxWear * 100).toFixed(2)}%`;
    }

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

    // Check angular velocity for performance throttling
    let angularVelMag = 0;
    let shouldSkipExpensiveCalcs = false;
    let shouldUseAggressiveThrottling = false;

    if (dynBody && dynMesh && !dynMesh.userData.isSoftBody) {
      const av = dynBody.getAngularVelocity();
      angularVelMag = Math.sqrt(av.x() * av.x() + av.y() * av.y() + av.z() * av.z());
      A.destroy(av);

      // Determine throttling level based on angular velocity
      if (angularVelMag > this.EXTREME_ANGULAR_VEL_THRESHOLD) {
        // Extreme spin: skip calculations 3 out of 4 frames
        shouldUseAggressiveThrottling = true;
        shouldSkipExpensiveCalcs = (this.frame % 4 !== 0);
      } else if (angularVelMag > this.HIGH_ANGULAR_VEL_THRESHOLD) {
        // High spin: skip calculations every other frame
        shouldSkipExpensiveCalcs = (this.frame % 2 !== 0);
      }
    }

    // Sample contacts (conditionally skip during high rotation)
    let newContactResult;
    if (shouldSkipExpensiveCalcs && this.cachedContactResult) {
      // Use cached result during high rotation
      newContactResult = this.cachedContactResult;
    } else {
      // Normal contact sampling
      newContactResult = sampleContacts(window.dispatcher, THREE, dynMesh, window.MIN_CONTACTS_FOR_STABLE_BOX, window.softGroundThreshold);
      // Cache for next frame if throttling active
      if (angularVelMag > this.HIGH_ANGULAR_VEL_THRESHOLD) {
        this.cachedContactResult = newContactResult;
      }
    }
    window.state.contactSamples = newContactResult.contactSamples;
    this.contactResult = newContactResult;

    // Update UI stats
    this.updateStats(dynBody, dynMesh);

    // Update visualization (conditionally skip during extreme rotation)
    if (!shouldUseAggressiveThrottling) {
      this.updateVisualization(dynBody, dynMesh);
    }

    // Compute bounding box (conditionally skip during high rotation)
    if (!shouldSkipExpensiveCalcs) {
      this.updateBoundingBox(dynMesh, dynBody);
    } else if (this.cachedOBB) {
      // Use cached OBB
      window.state.lastOBB = this.cachedOBB;
      updateOBBVisualization(this.visualizationManager.obbGroup, this.cachedOBB, window.state.paddingWidthScale, window.state.paddingHeightScale, window.state.paddingDepthTopScale, window.state.paddingDepthBottomScale, CFG, THREE);
      this.visualizationManager.obbGroup.visible = window.state.showOBB;
    }

    // Render main scene
    this.renderer.render(this.scene, this.camera);

    // Render PiP views and handle stamping (conditionally throttle during extreme rotation)
    this.renderPiPAndStamp(now, dynBody, dynMesh, shouldUseAggressiveThrottling);
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

  /**
   * Update rigid body physics with forces applied at base vertices
   *
   * Force X, Z: Applied at the BASE (lowest point) of the object
   * - Creates torque if applied off-center from CoM
   * - Simulates pushing on the bottom of an object
   *
   * Force Y: Applied at center of mass (no torque)
   */
  updateRigidBodyPhysics(dynBody, dt) {
    if (window.state.forceX !== 0 || window.state.forceZ !== 0) {
      // Get object's axis-aligned bounding box to find base
      const mesh = this.bodyManager.getMesh();
      let baseOffset = -1.0; // Default: 1 unit below CoM

      if (mesh && mesh.geometry) {
        // Calculate bounding box to find actual base position
        if (!mesh.geometry.boundingBox) {
          mesh.geometry.computeBoundingBox();
        }
        const bbox = mesh.geometry.boundingBox;
        if (bbox) {
          // Base is at the minimum Y position
          baseOffset = bbox.min.y;
        }
      }

      // Apply horizontal forces (X, Z) at the base
      // This creates torque: τ = r × F
      const impulseXZ = new A.btVector3(window.state.forceX * dt, 0, window.state.forceZ * dt);
      const relativePos = new A.btVector3(0, baseOffset, 0); // At base (negative Y from CoM)

      dynBody.applyImpulse(impulseXZ, relativePos);
      A.destroy(impulseXZ);
      A.destroy(relativePos);
      dynBody.activate();
    }

    // Apply vertical force (Y) at center of mass (no torque)
    if (window.state.forceY !== 0) {
      const impulseY = new A.btVector3(0, window.state.forceY * dt, 0);
      dynBody.applyCentralImpulse(impulseY);
      A.destroy(impulseY);
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
      const lvx = sanitizePhysicsValue(lv.x());
      const lvy = sanitizePhysicsValue(lv.y());
      const lvz = sanitizePhysicsValue(lv.z());
      const velMag = Math.sqrt(lvx * lvx + lvy * lvy + lvz * lvz);
      document.getElementById('velocity').textContent = 
        `${velMag.toFixed(2)} m/s (${lvx.toFixed(1)}, ${lvy.toFixed(1)}, ${lvz.toFixed(1)})`;
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

      // Calculate angular momentum: L = I × ω
      this.updateAngularMomentumDisplay(dynBody, dynMesh, av);

      A.destroy(av);
    } else {
      document.getElementById('angularVel').textContent = 'N/A (soft body)';
      document.getElementById('angularMomentum').textContent = 'N/A (soft body)';
    }
  }

  /**
   * Calculate and display angular momentum
   * Physics: L = I × ω (component-wise for diagonal inertia tensor)
   * Units: kg·m²/s
   *
   * Coordinate space: World space (both I and ω from Ammo are in world frame)
   */
  updateAngularMomentumDisplay(dynBody, dynMesh, angularVelocity) {
    const angMomEl = document.getElementById('angularMomentum');
    if (!angMomEl) return;

    try {
      // Get mass
      const mass = dynBody.getMass ? dynBody.getMass() : (this.bodyManager?.mass || 2.0);

      // Use smaller, more realistic estimate for moment of inertia
      // For typical objects at unit scale: I ≈ 0.05 to 0.2 * m
      let I_estimate = mass * 0.08; // Reduced from 0.5 to make values more reasonable

      // If we have userData with moment of inertia, use that
      if (dynMesh.userData && dynMesh.userData.momentOfInertiaZ) {
        I_estimate = dynMesh.userData.momentOfInertiaZ;
      }

      // Calculate angular momentum: L = I × ω
      const Lx = I_estimate * angularVelocity.x();
      const Ly = I_estimate * angularVelocity.y();
      const Lz = I_estimate * angularVelocity.z();

      // Magnitude
      const L_mag = Math.sqrt(Lx * Lx + Ly * Ly + Lz * Lz);

      // Display with adaptive formatting
      let displayText;
      if (L_mag > 100) {
        // Use scientific notation for very large values
        displayText = `${L_mag.toExponential(2)} kg·m²/s`;
      } else if (L_mag > 10) {
        // Show fewer decimals for large values
        displayText = `${L_mag.toFixed(1)} kg·m²/s`;
      } else {
        // Show more decimals for small values
        displayText = `${L_mag.toFixed(3)} kg·m²/s`;
      }
      
      // Show components only if they're reasonable size (not too large)
      if (Math.abs(Lx) < 50 && Math.abs(Ly) < 50 && Math.abs(Lz) < 50) {
        displayText += ` (${Lx.toFixed(2)}, ${Ly.toFixed(2)}, ${Lz.toFixed(2)})`;
      }

      angMomEl.textContent = displayText;

    } catch (e) {
      console.warn('Error calculating angular momentum:', e);
      angMomEl.textContent = '— (error)';
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
      
      // Filter contact samples based on enableSynthetic setting
      let contactsForBBox = window.state.contactSamples;
      if (!window.state.enableSynthetic) {
        // Only use real contacts (filter out synthetic)
        contactsForBBox = window.state.contactSamples.filter(pt => !pt.isSynthetic);
        
        // If no real contacts remain, skip bounding box calculation
        if (contactsForBBox.length === 0) {
          window.state.lastOBB = null;
          this.cachedOBB = null;
          if (this.visualizationManager.obbGroup) this.visualizationManager.obbGroup.visible = false;
          document.getElementById('obbAng').textContent = '—';
          return;
        }
      }
      
      const obb = computeBoundingBox(
        contactsForBBox,
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
        this.cachedOBB = obb; // Cache for performance throttling
        updateOBBVisualization(this.visualizationManager.obbGroup, obb, window.state.paddingWidthScale, window.state.paddingHeightScale, window.state.paddingDepthTopScale, window.state.paddingDepthBottomScale, CFG, THREE);
        this.visualizationManager.obbGroup.visible = window.state.showOBB;
        const angDeg = (obb.theta * 180 / Math.PI).toFixed(2);
        document.getElementById('obbAng').textContent = angDeg + '°';
      }
    } else {
      window.state.lastOBB = null;
      this.cachedOBB = null;
      if (this.visualizationManager.obbGroup) this.visualizationManager.obbGroup.visible = false;
      document.getElementById('obbAng').textContent = '—';
    }
  }

  renderPiPAndStamp(now, dynBody, dynMesh, skipPiPRendering = false) {
    // Skip PiP rendering during extreme rotation for performance
    if (skipPiPRendering) {
      return;
    }

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
        velocity = sanitizeVector3({ x: lv.x(), y: lv.y(), z: lv.z() });
        const velocityMag = Math.sqrt(velocity.x * velocity.x + velocity.z * velocity.z);
        if (velocityMag > 0.5) {
          cameraRotation = Math.atan2(-lv.z(), lv.x());
        }
        A.destroy(lv);

        // Get angular velocity for rigid bodies
        const av = dynBody.getAngularVelocity();
        angularVelocity = sanitizeVector3({ x: av.x(), y: av.y(), z: av.z() });
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

    // Calculate timestep for PiP rendering
    const pipTimestep = this.lastPiPTime > 0 ? Math.min((now - this.lastPiPTime) / 1000, 0.1) : 0.001;
    this.lastPiPTime = now;

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
      normalForce,
      pipTimestep,
      window.slidingDistanceManager
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
    // Calculate timestep before updating lastStampTime
    const timestep = this.lastStampTime > 0 ? (now - this.lastStampTime) / 1000 : 0.001;
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

      // Accumulate flow with timestep for sliding distance calculation
      window.flowAccumulationManager.accumulate(
        pixels1,
        pixels2,
        velocity,
        angularVelocity,
        normalForce,
        window.state.lastOBB,
        stampWorldX,
        stampWorldZ,
        timestep  // δt in seconds
      );

      // Accumulate sliding distance
      if (window.slidingDistanceManager) {
        window.slidingDistanceManager.accumulate(
          pixels1,
          pixels2,
          velocity,
          angularVelocity,
          window.state.lastOBB,
          timestep
        );
        
        // Render sliding distance to ground canvas
        window.slidingDistanceManager.render();
      }

      // Note: PiP6 is now instant (no accumulation), so no splatting needed

      // Render flow to ground canvas
      window.flowAccumulationManager.render();

      // Update variant ground textures if loaded
      if (window.groundVariantManager && window.groundVariantManager.variantRoot) {
        // Update blend texture (wear accumulation as grayscale)
        const wearTexture = window.flowAccumulationManager.generateWearBlendTexture(THREE);
        window.groundVariantManager.setWearBlendTexture(wearTexture);

        // Update flow map if flow is enabled
        if (window.groundVariantManager.enableFlow) {
          const flowTexture = window.flowAccumulationManager.generateFlowMapTexture(THREE);
          window.groundVariantManager.setFlowMapTexture(flowTexture);
        }
      }

      // Update visibility
      if (window.state.showFlowOverlay && !window.flowAccumulationManager.flowOverlay.visible) {
        window.flowAccumulationManager.flowOverlay.visible = true;
      }
    }
  }
}

// ======= Global Variables =======
let sceneManager, physicsManager, groundManager, visualizationManager, stampingManager, flowAccumulationManager, slidingDistanceManager, groundVariantManager;
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
  torqueX: 0, torqueY: 0, torqueZ: 0,
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
  slidingDistanceManager = new SlidingDistanceManager(sceneData.scene, CFG, THREE);
  groundVariantManager = new GroundVariantManager(sceneData.scene, physicsData.world, physicsData.A, CFG, THREE);

  // Initialize ground and obstacles
  const groundData = groundManager.init();

  // Initialize other systems
  const stampingData = stampingManager.init();
  const flowAccumulationData = flowAccumulationManager.init();
  const slidingDistanceData = slidingDistanceManager.init();
  
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
  window.groundVariantManager = groundVariantManager;
  window.flowAccumulationManager = flowAccumulationManager;
  window.slidingDistanceManager = slidingDistanceManager;
  window.world = physicsData.world;
  window.dispatcher = physicsData.dispatcher;
  window.scene = sceneData.scene;
  window.camera = sceneData.camera;
  window.renderer = sceneData.renderer;
  window.controls = sceneData.controls;
  window.ground = groundData.ground;
  window.groundBody = groundData.groundBody;
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