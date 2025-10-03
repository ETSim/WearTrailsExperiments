// Main Application - Complete Refactored Version
// PiP OBB Physics - Enhanced Collision Visualization
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';

// Import modules
import { generateRandomGroundTexture, generateRandomCubeTexture } from './textures.js';
import { sampleContacts } from './contacts.js';
import { computeBoundingBox } from './bounding-box/index.js';
import { BodyManager } from './body-manager.js';
import { UVPaintSystem } from './uv-paint.js';
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
  PIP_W: 512,
  PIP_H: 512,
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

// ======= Field and Flow Manager Class =======
class FieldFlowManager {
  constructor(scene, CFG) {
    this.scene = scene;
    this.CFG = CFG;
    this.fieldCanvas = null;
    this.fieldCtx = null;
    this.fieldTexture = null;
    this.fieldOverlay = null;
    this.flowCanvas = null;
    this.flowCtx = null;
    this.flowTexture = null;
    this.flowOverlay = null;
    this.fieldIntensity = null;
    this.flowDirX = null;
    this.flowDirZ = null;
    this.flowMagnitude = null;
  }

  init() {
    // Field intensity layer
    this.fieldCanvas = document.createElement('canvas');
    this.fieldCanvas.width = 256;
    this.fieldCanvas.height = 256;
    this.fieldCtx = this.fieldCanvas.getContext('2d', { willReadFrequently: true });
    this.fieldCtx.fillStyle = 'black';
    this.fieldCtx.fillRect(0, 0, 256, 256);

    this.fieldIntensity = new Float32Array(256 * 256);
    this.fieldTexture = new THREE.CanvasTexture(this.fieldCanvas);
    this.fieldTexture.wrapS = THREE.ClampToEdgeWrapping;
    this.fieldTexture.wrapT = THREE.ClampToEdgeWrapping;

    this.fieldOverlay = new THREE.Mesh(
      new THREE.PlaneGeometry(this.CFG.PLANE_SIZE, this.CFG.PLANE_SIZE),
      new THREE.MeshBasicMaterial({
        map: this.fieldTexture,
        transparent: true,
        opacity: 0.7,
        side: THREE.FrontSide,
        depthWrite: false,
        blending: THREE.AdditiveBlending
      })
    );
    this.fieldOverlay.rotation.x = -Math.PI / 2;
    this.fieldOverlay.position.y = 0.02;
    this.fieldOverlay.visible = false;
    this.fieldOverlay.renderOrder = 900; // Below stamps
    this.scene.add(this.fieldOverlay);

    // Flow direction layer
    this.flowCanvas = document.createElement('canvas');
    this.flowCanvas.width = 256;
    this.flowCanvas.height = 256;
    this.flowCtx = this.flowCanvas.getContext('2d', { willReadFrequently: true });
    this.flowCtx.fillStyle = 'black';
    this.flowCtx.fillRect(0, 0, 256, 256);

    this.flowDirX = new Float32Array(256 * 256);
    this.flowDirZ = new Float32Array(256 * 256);
    this.flowMagnitude = new Float32Array(256 * 256);
    this.flowTexture = new THREE.CanvasTexture(this.flowCanvas);
    this.flowTexture.wrapS = THREE.ClampToEdgeWrapping;
    this.flowTexture.wrapT = THREE.ClampToEdgeWrapping;

    this.flowOverlay = new THREE.Mesh(
      new THREE.PlaneGeometry(this.CFG.PLANE_SIZE, this.CFG.PLANE_SIZE),
      new THREE.MeshBasicMaterial({
        map: this.flowTexture,
        transparent: true,
        opacity: 0.7,
        side: THREE.FrontSide,
        depthWrite: false,
        blending: THREE.AdditiveBlending
      })
    );
    this.flowOverlay.rotation.x = -Math.PI / 2;
    this.flowOverlay.position.y = 0.03;
    this.flowOverlay.visible = false;
    this.flowOverlay.renderOrder = 950; // Below stamps, above field
    this.scene.add(this.flowOverlay);

    return {
      fieldCanvas: this.fieldCanvas,
      fieldCtx: this.fieldCtx,
      fieldTexture: this.fieldTexture,
      fieldOverlay: this.fieldOverlay,
      flowCanvas: this.flowCanvas,
      flowCtx: this.flowCtx,
      flowTexture: this.flowTexture,
      flowOverlay: this.flowOverlay,
      fieldIntensity: this.fieldIntensity,
      flowDirX: this.flowDirX,
      flowDirZ: this.flowDirZ,
      flowMagnitude: this.flowMagnitude
    };
  }

  worldToFieldPixel(worldX, worldZ) {
    const x = ((worldX + this.CFG.PLANE_SIZE / 2) / this.CFG.PLANE_SIZE) * 256;
    const y = ((worldZ + this.CFG.PLANE_SIZE / 2) / this.CFG.PLANE_SIZE) * 256;
    return { x: Math.floor(Math.max(0, Math.min(255, x))), y: Math.floor(Math.max(0, Math.min(255, y))) };
  }

  accumulateField(worldX, worldZ, normalForce, fieldGain, radius = 10) {
    const center = this.worldToFieldPixel(worldX, worldZ);
    const radiusSq = radius * radius;
    
    const referenceForce = 2.0 * 9.81;
    const forceMultiplier = Math.sqrt(normalForce / referenceForce);
    const effectiveGain = fieldGain * forceMultiplier;
    
    for (let dy = -radius; dy <= radius; dy++) {
      for (let dx = -radius; dx <= radius; dx++) {
        const distSq = dx * dx + dy * dy;
        if (distSq <= radiusSq) {
          const px = center.x + dx;
          const py = center.y + dy;
          if (px >= 0 && px < 256 && py >= 0 && py < 256) {
            const idx = py * 256 + px;
            const falloff = 1.0 - Math.sqrt(distSq) / radius;
            this.fieldIntensity[idx] = Math.min(10.0, this.fieldIntensity[idx] + effectiveGain * falloff);
          }
        }
      }
    }
  }

  accumulateFlow(worldX, worldZ, velX, velZ, flowAlpha, similarityThreshold, radius = 20) {
    const center = this.worldToFieldPixel(worldX, worldZ);
    const velMag = Math.sqrt(velX * velX + velZ * velZ);
    if (velMag < 0.01) return;
    
    const normVelX = velX / velMag;
    const normVelZ = velZ / velMag;
    const radiusSq = radius * radius;
    
    for (let dy = -radius; dy <= radius; dy++) {
      for (let dx = -radius; dx <= radius; dx++) {
        const distSq = dx * dx + dy * dy;
        if (distSq <= radiusSq) {
          const px = center.x + dx;
          const py = center.y + dy;
          if (px >= 0 && px < 256 && py >= 0 && py < 256) {
            const idx = py * 256 + px;
            const falloff = 1.0 - Math.sqrt(distSq) / radius;
            
            const existingMag = this.flowMagnitude[idx];
            let similarity = 1.0;
            
            if (existingMag > 0.01) {
              const existingDirX = this.flowDirX[idx] / existingMag;
              const existingDirZ = this.flowDirZ[idx] / existingMag;
              similarity = normVelX * existingDirX + normVelZ * existingDirZ;
            }
            
            if (similarity > similarityThreshold) {
              this.flowDirX[idx] += flowAlpha * normVelX * falloff * velMag;
              this.flowDirZ[idx] += flowAlpha * normVelZ * falloff * velMag;
              this.flowMagnitude[idx] = Math.sqrt(this.flowDirX[idx] * this.flowDirX[idx] + this.flowDirZ[idx] * this.flowDirZ[idx]);
            }
          }
        }
      }
    }
  }

  renderField(fieldGain) {
    const imgData = this.fieldCtx.createImageData(256, 256);
    const data = imgData.data;
    
    const PASSES_FOR_WHITE = 500;
    
    for (let i = 0; i < this.fieldIntensity.length; i++) {
      const equivalentStamps = this.fieldIntensity[i] / fieldGain;
      const normalized = Math.min(1.0, equivalentStamps / PASSES_FOR_WHITE);
      const gray = Math.floor(255 * normalized);
      
      const idx = i * 4;
      data[idx] = gray;
      data[idx + 1] = gray;
      data[idx + 2] = gray;
      data[idx + 3] = Math.floor(255 * normalized);
    }
    
    this.fieldCtx.putImageData(imgData, 0, 0);
    this.fieldTexture.needsUpdate = true;
  }

  renderFlow() {
    const imgData = this.flowCtx.createImageData(256, 256);
    const data = imgData.data;
    
    let maxMag = 0;
    for (let i = 0; i < this.flowMagnitude.length; i++) {
      if (this.flowMagnitude[i] > maxMag) maxMag = this.flowMagnitude[i];
    }
    
    if (maxMag < 0.01) maxMag = 1.0;
    
    for (let i = 0; i < this.flowMagnitude.length; i++) {
      const mag = this.flowMagnitude[i];
      const idx = i * 4;
      
      if (mag > 0.001) {
        const dirX = this.flowDirX[i] / mag;
        const dirZ = this.flowDirZ[i] / mag;
        
        const angle = Math.atan2(dirZ, dirX);
        const hue = (angle + Math.PI) / (2 * Math.PI);
        
        const normalizedMag = Math.min(1.0, mag / maxMag);
        
        const h = hue;
        const s = normalizedMag;
        const v = 1.0;
        
        const i_h = Math.floor(h * 6);
        const f = h * 6 - i_h;
        const p = v * (1 - s);
        const q = v * (1 - f * s);
        const t = v * (1 - (1 - f) * s);
        
        let r, g, b;
        switch (i_h % 6) {
          case 0: r = v; g = t; b = p; break;
          case 1: r = q; g = v; b = p; break;
          case 2: r = p; g = v; b = t; break;
          case 3: r = p; g = q; b = v; break;
          case 4: r = t; g = p; b = v; break;
          case 5: r = v; g = p; b = q; break;
          default: r = v; g = t; b = p; break;
        }
        
        data[idx] = Math.floor(r * 255);
        data[idx + 1] = Math.floor(g * 255);
        data[idx + 2] = Math.floor(b * 255);
        data[idx + 3] = Math.floor(normalizedMag * 255);
      } else {
        data[idx] = 0;
        data[idx + 1] = 0;
        data[idx + 2] = 0;
        data[idx + 3] = 0;
      }
    }
    
    this.flowCtx.putImageData(imgData, 0, 0);
    this.flowTexture.needsUpdate = true;
  }

  clearField() {
    this.fieldIntensity.fill(0);
    this.renderField(0.02);
  }

  clearFlow() {
    this.flowDirX.fill(0);
    this.flowDirZ.fill(0);
    this.flowMagnitude.fill(0);
    this.renderFlow();
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
    this.setupUVPaintControls();
    this.setupFieldFlowControls();
    
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
      document.getElementById('pause').textContent = 'Pause';
    };

    document.getElementById('pause').onclick = () => {
      window.state.isPaused = !window.state.isPaused;
      document.getElementById('pause').textContent = window.state.isPaused ? 'Resume' : 'Pause';
    };

    document.getElementById('shape').onchange = (e) => {
      window.bodyManager.setShapeType(e.target.value);
      document.getElementById('customBodyRow').style.display =
        (e.target.value === 'custom') ? 'flex' : 'none';
      document.getElementById('softBodySection').style.display =
        (e.target.value === 'cubeSoft') ? 'block' : 'none';
      if (e.target.value !== 'custom') window.bodyManager.start();
    };

    document.getElementById('bodyFile').onchange = async (e) => {
      if (e.target.files && e.target.files[0]) {
        window.bodyManager.setCustomBodyURL(URL.createObjectURL(e.target.files[0]));
        await window.bodyManager.start();
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
    document.getElementById('timestepHz').oninput = (e) => {
      window.state.timestepHz = parseInt(e.target.value);
      document.getElementById('timestepHzVal').textContent = window.state.timestepHz + ' Hz';
    };

    document.getElementById('maxSubsteps').oninput = (e) => {
      window.state.maxSubsteps = parseInt(e.target.value);
      document.getElementById('maxSubstepsVal').textContent = window.state.maxSubsteps.toString();
    };

    document.getElementById('fixedTimestep').oninput = (e) => {
      window.state.fixedTimestep = parseInt(e.target.value);
      document.getElementById('fixedTimestepVal').textContent = window.state.fixedTimestep + ' Hz';
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

    const showPiP4El = document.getElementById('showPiP4');
    if (showPiP4El) {
      showPiP4El.onchange = (e) => {
        window.state.showPiP4 = e.target.checked;
        document.getElementById('pip4').style.display = window.state.showPiP4 ? 'block' : 'none';
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
          console.log(`Show Stamps toggled: ${window.state.showStamps}, overlay visible: ${window.stampingManager.stampOverlay.visible}`);
          
          // Force texture update to ensure stamps are visible
          if (window.state.showStamps) {
            window.stampingManager.stampTexture.needsUpdate = true;
          }
        } else {
          console.warn('StampingManager or stampOverlay not available');
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


    const stampIntervalEl = document.getElementById('stampInterval');
    if (stampIntervalEl) {
      stampIntervalEl.oninput = (e) => {
        window.state.stampInterval = parseInt(e.target.value);
        document.getElementById('stampIntervalVal').textContent = window.state.stampInterval + ' ms';
      };
    }

    const lineIntensityEl = document.getElementById('lineIntensity');
    if (lineIntensityEl) {
      lineIntensityEl.oninput = (e) => {
        const intensity = parseInt(e.target.value);
        window.state.lineIntensityScale = intensity / 100;
        document.getElementById('lineIntensityVal').textContent = intensity + '%';
      };
    }
  }

  setupUVPaintControls() {
    // Enable/disable UV paint
    const enableUVPaintEl = document.getElementById('enableUVPaint');
    if (enableUVPaintEl) {
      enableUVPaintEl.onchange = (e) => {
        window.state.enableUVPaint = e.target.checked;
        if (window.animationManager && window.animationManager.uvPaintSystem) {
          window.animationManager.uvPaintSystem.setEnabled(e.target.checked);
        }
      };
    }

    // Clear UV paint
    const clearUVPaintEl = document.getElementById('clearUVPaint');
    if (clearUVPaintEl) {
      clearUVPaintEl.onclick = () => {
        if (window.animationManager && window.animationManager.uvPaintSystem) {
          window.animationManager.uvPaintSystem.clearPaint();
        }
      };
    }

    // Save UV paint
    const saveUVPaintEl = document.getElementById('saveUVPaint');
    if (saveUVPaintEl) {
      saveUVPaintEl.onclick = () => {
        if (window.animationManager && window.animationManager.uvPaintSystem) {
          const canvas = window.animationManager.uvPaintSystem.getGroundUVCanvas();
          if (canvas) {
            const link = document.createElement('a');
            link.download = `ground-uv-paint-${Date.now()}.png`;
            link.href = canvas.toDataURL();
            link.click();
          }
        }
      };
    }
  }

  setupFieldFlowControls() {
    const enableFieldEl = document.getElementById('enableField');
    if (enableFieldEl) {
      enableFieldEl.onchange = (e) => {
        window.state.enableField = e.target.checked;
      };
    }

    const showFieldEl = document.getElementById('showField');
    if (showFieldEl) {
      showFieldEl.onchange = (e) => {
        window.fieldFlowManager.fieldOverlay.visible = e.target.checked;
      };
    }

    const clearFieldEl = document.getElementById('clearField');
    if (clearFieldEl) {
      clearFieldEl.onclick = () => {
        window.fieldFlowManager.clearField();
      };
    }

    const saveFieldEl = document.getElementById('saveField');
    if (saveFieldEl) {
      saveFieldEl.onclick = () => {
        window.saveCanvasAsPNG(window.fieldFlowManager.fieldCanvas, 'field_intensity.png');
      };
    }

    const fieldGainEl = document.getElementById('fieldGain');
    if (fieldGainEl) {
      fieldGainEl.oninput = (e) => {
        window.state.fieldGain = parseInt(e.target.value) / 100;
        document.getElementById('fieldGainValue').textContent = window.state.fieldGain.toFixed(2);
      };
    }

    const enableFlowEl = document.getElementById('enableFlow');
    if (enableFlowEl) {
      enableFlowEl.onchange = (e) => {
        window.state.enableFlow = e.target.checked;
      };
    }

    const showFlowEl = document.getElementById('showFlow');
    if (showFlowEl) {
      showFlowEl.onchange = (e) => {
        window.fieldFlowManager.flowOverlay.visible = e.target.checked;
      };
    }

    const clearFlowEl = document.getElementById('clearFlow');
    if (clearFlowEl) {
      clearFlowEl.onclick = () => {
        window.fieldFlowManager.clearFlow();
      };
    }

    const saveFlowEl = document.getElementById('saveFlow');
    if (saveFlowEl) {
      saveFlowEl.onclick = () => {
        window.saveCanvasAsPNG(window.fieldFlowManager.flowCanvas, 'flow_direction.png');
      };
    }

    const flowAlphaEl = document.getElementById('flowAlpha');
    if (flowAlphaEl) {
      flowAlphaEl.oninput = (e) => {
        window.state.flowAlpha = parseInt(e.target.value) / 100;
        document.getElementById('flowAlphaValue').textContent = window.state.flowAlpha.toFixed(2);
      };
    }

    const flowSimilarityEl = document.getElementById('flowSimilarity');
    if (flowSimilarityEl) {
      flowSimilarityEl.oninput = (e) => {
        window.state.similarityThreshold = parseInt(e.target.value) / 100;
        document.getElementById('flowSimilarityValue').textContent = window.state.similarityThreshold.toFixed(2);
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
        collapsible.classList.toggle('collapsed');
      });
    });
  }
}

// ======= Animation Manager Class =======
class AnimationManager {
  constructor(scene, camera, renderer, bodyManager, pipManager, visualizationManager, stampingManager, fieldFlowManager) {
    this.scene = scene;
    this.camera = camera;
    this.renderer = renderer;
    this.bodyManager = bodyManager;
    this.pipManager = pipManager;
    this.visualizationManager = visualizationManager;
    this.stampingManager = stampingManager;
    this.fieldFlowManager = fieldFlowManager;
    
    // Initialize UV paint system
    this.uvPaintSystem = new UVPaintSystem(THREE);
    
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
  
  // Initialize UV paint system with ground mesh (called after scene setup)
  initUVPaintSystem(groundMesh) {
    if (this.uvPaintSystem && groundMesh) {
      this.uvPaintSystem.init(groundMesh);
    }
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
    
    // Physics step
    if (!window.state.isPaused) {
      this.stepPhysics(now, dynBody, dynMesh);
      window.world.stepSimulation(1 / window.state.timestepHz, window.state.maxSubsteps, 1 / window.state.fixedTimestep);
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
    // Calculate camera rotation and velocity for PiP rendering
    let cameraRotation = null;
    let velocity = null;
    let normalForce = 20.0;

    if (dynBody && window.state.lastOBB) {
      if (dynMesh && dynMesh.userData.isSoftBody) {
        const nodes = dynBody.get_m_nodes();
        const nodeCount = nodes.size();
        let avgVx = 0, avgVz = 0;
        
        for (let i = 0; i < nodeCount; i++) {
          const node = nodes.at(i);
          const nodeVel = node.get_m_v();
          avgVx += nodeVel.x();
          avgVz += nodeVel.z();
        }
        
        if (nodeCount > 0) {
          avgVx /= nodeCount;
          avgVz /= nodeCount;
          velocity = { x: avgVx, z: avgVz };
          const velocityMag = Math.sqrt(avgVx * avgVx + avgVz * avgVz);
          if (velocityMag > 0.5) {
            cameraRotation = Math.atan2(-avgVz, avgVx);
          }
        }
      } else {
        const lv = dynBody.getLinearVelocity();
        velocity = { x: lv.x(), z: lv.z() };
        const velocityMag = Math.sqrt(lv.x() * lv.x() + lv.z() * lv.z());
        if (velocityMag > 0.5) {
          cameraRotation = Math.atan2(-lv.z(), lv.x());
        }
        A.destroy(lv);
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
      null,
      cameraRotation,
      window.state.showPiP4,
      velocity,
      normalForce,
      window.state.lineIntensityScale
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
        console.log(`Soft body ground contact rejected: only ${groundContactPoints} contact points (need ≥2)`);
      } else {
        console.log(`Soft body ground contact confirmed: ${groundContactPoints} contact points`);
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
        
        if (hasGroundContact) {
          console.log(`Rigid body ground contact confirmed: ${groundContactPoints} contact points`);
        } else {
          console.log(`Rigid body ground contact rejected: body Y=${bodyLowestY.toFixed(2)}, contacts=${groundContactPoints}`);
        }
      }
    }
    
    // Also validate that we have enough contact samples for meaningful stamping
    const validContactSamples = window.state.contactSamples.filter(contact => 
      contact.y <= 0.1 // Stricter: contact points must be very close to ground level
    );
    
    const finalResult = hasGroundContact && validContactSamples.length >= 1; // Need at least 1 valid ground contact
    
    console.log(`Ground collision validation: hasGroundContact=${hasGroundContact}, validContactSamples=${validContactSamples.length}, result=${finalResult}`);
    
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
      stampWorldX = window.state.lastOBB.center.x;
      stampWorldZ = window.state.lastOBB.center.z;
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
    
    if (window.state.stampLineStencil && this.pipManager && this.pipManager.pip4) {
      this.pipManager.pip4.forceUpdate(velocity, normalForce, window.state.lineIntensityScale);
      const lineStencilCanvas = this.pipManager.pip4.getStencilCanvas();
      if (lineStencilCanvas) {
        this.stampingManager.stampCtx.drawImage(
          lineStencilCanvas,
          -stampSize / 2,
          -stampSize / 2,
          stampSize,
          stampSize
        );
      }
    }
    
    // UV Paint: Back stamp changes into ground UV texture
    if (this.uvPaintSystem.isEnabled) {
      // Use the current stamp canvas (intersection or line stencil) and paint it to ground UV
      let stampCanvasToUse = intersectionCanvas;
      
      // If line stencil is enabled, use line stencil canvas instead
      if (window.state.stampLineStencil && this.pipManager && this.pipManager.pip4) {
        const lineStencilCanvas = this.pipManager.pip4.getStencilCanvas();
        if (lineStencilCanvas) {
          stampCanvasToUse = lineStencilCanvas;
        }
      }
      
      // Paint the stamp directly to ground UV texture
      this.uvPaintSystem.paintStampToGroundUV(
        stampCanvasToUse,
        stampWorldX,
        stampWorldZ,
        stampSizeWorld,
        CFG.PLANE_SIZE
      );
    }
    
    // Regular stamping continues normally
    if (window.state.stampLineStencil && this.pipManager && this.pipManager.pip4) {
      this.pipManager.pip4.forceUpdate(velocity, normalForce, window.state.lineIntensityScale);
      const lineStencilCanvas = this.pipManager.pip4.getStencilCanvas();
      if (lineStencilCanvas) {
        this.stampingManager.stampCtx.drawImage(
          lineStencilCanvas,
          -stampSize / 2,
          -stampSize / 2,
          stampSize,
          stampSize
        );
      }
    } else {
      this.stampingManager.stampCtx.drawImage(
        intersectionCanvas,
        -stampSize / 2,
        -stampSize / 2,
        stampSize,
        stampSize
      );
    }
    
    this.stampingManager.stampCtx.restore();
    this.stampingManager.stampTexture.needsUpdate = true;
    
    // Debug: Log stamping details
    console.log(`Stamp applied at (${stampWorldX.toFixed(2)}, ${stampWorldZ.toFixed(2)}) with size ${stampSizeWorld.toFixed(2)}`);
    console.log(`Stamp overlay visible: ${this.stampingManager.stampOverlay.visible}, Show stamps state: ${window.state.showStamps}`);
    
    // Ensure the stamp overlay is visible if Show Stamps is enabled
    if (window.state.showStamps && !this.stampingManager.stampOverlay.visible) {
      console.warn('Show Stamps is enabled but overlay is not visible, fixing...');
      this.stampingManager.stampOverlay.visible = true;
    }
    
    // Accumulate field and flow
    if (window.state.enableField) {
      this.fieldFlowManager.accumulateField(stampWorldX, stampWorldZ, normalForce, window.state.fieldGain, 10);
      this.fieldFlowManager.renderField(window.state.fieldGain);
      
      const normalForceEl = document.getElementById('normalForce');
      if (normalForceEl) {
        normalForceEl.textContent = normalForce.toFixed(1) + ' N';
      }
    }
    
    if (window.state.enableFlow && velocity) {
      const velocityMag = Math.sqrt(velocity.x * velocity.x + velocity.z * velocity.z);
      if (velocityMag > 0.01) {
        this.fieldFlowManager.accumulateFlow(stampWorldX, stampWorldZ, velocity.x, velocity.z, window.state.flowAlpha, window.state.similarityThreshold, 20);
        this.fieldFlowManager.renderFlow();
      }
    }
  }
}

// ======= Global Variables =======
let sceneManager, physicsManager, groundManager, visualizationManager, stampingManager, fieldFlowManager;
let bodyManager, pipManager, uiManager, animationManager;

// ======= State Object =======
const state = {
  isPaused: false,
  showOBB: false,
  showContacts: false,
  showGeomCenter: false,
  showWallObstacle: false,
  showStamps: false,
  showPiP4: true,
  pipEnabled: true,
  enableStamping: true,
  stampLineStencil: true,
  useBBoxCenter: false,
  useCustomPattern: false,
  enableField: true,
  enableFlow: true,
  
  // UV Paint system state
  enableUVPaint: false,
  
  paddingWidthScale: 1.0,
  paddingHeightScale: 1.0,
  paddingDepthTopScale: 0.1,
  paddingDepthBottomScale: 0.1,
  forceX: 0, forceY: 0, forceZ: 0,
  gravity: 9.81,
  timestepHz: 60,
  maxSubsteps: 10,
  fixedTimestep: 120,
  
  stampInterval: 280,
  lineIntensityScale: 1.0,
  fieldGain: 1.0,
  flowAlpha: 0.8,
  similarityThreshold: 0.5,
  
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
  fieldFlowManager = new FieldFlowManager(sceneData.scene, CFG);
  
  // Initialize ground and obstacles
  const groundData = groundManager.init();
  
  // Initialize other systems
  const stampingData = stampingManager.init();
  const fieldFlowData = fieldFlowManager.init();
  
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
    stampingManager, 
    fieldFlowManager
  );
  
  // Initialize UV paint system with ground mesh
  animationManager.initUVPaintSystem(sceneManager.ground);
  
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
  window.fieldFlowManager = fieldFlowManager;
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
  
  // Setup UI AFTER all globals are available
  uiManager.initializeEventListeners();
  uiManager.initializeCollapsibleSections();
  
  // Start simulation
  bodyManager.start();
  animationManager.start();
}

// ======= Start Application =======
init().catch(console.error);