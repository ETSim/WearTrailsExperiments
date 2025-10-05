// Main Application File - Refactored & Modular
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
  PIP_W: 512,
  PIP_H: 512,
  OBB_DEPTH: 2.5,
  MIN_CONTACT_SIZE: 0.05,
  CONTACT_POINT_SIZE: 0.12,
  GEOM_MEAN_SIZE: 0.18
};

// ======= Scene Setup =======
const aspect = innerWidth / innerHeight;
const camera = new THREE.PerspectiveCamera(60, aspect, 0.1, 200);
camera.position.set(12, 10, 12);
camera.lookAt(0, 0, 0);

const renderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true });
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.setSize(innerWidth, innerHeight);
document.body.appendChild(renderer.domElement);

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x0b0b0b);

const controls = new OrbitControls(camera, renderer.domElement);
controls.enableRotate = true;
controls.enablePan = true;
controls.enableZoom = true;
controls.target.set(0, 0, 0);
controls.minDistance = 5;
controls.maxDistance = 50;
controls.maxPolarAngle = Math.PI * 0.9;
controls.update();

// ======= Lights =======
scene.add(new THREE.AmbientLight(0xffffff, 0.4));
const dirLight = new THREE.DirectionalLight(0xffffff, 0.7);
dirLight.position.set(10, 15, 5);
scene.add(dirLight);

// Add light under the ground plane
const underLight = new THREE.PointLight(0xffffff, 0.3, 30);
underLight.position.set(0, -2, 0);
scene.add(underLight);

// ======= Stamping Canvas (Invisible) =======
const stampCanvas = document.createElement('canvas');
stampCanvas.width = 2048;
stampCanvas.height = 2048;
const stampCtx = stampCanvas.getContext('2d', { willReadFrequently: true, alpha: true });
stampCtx.fillStyle = 'rgba(0, 0, 0, 0)';
stampCtx.fillRect(0, 0, 2048, 2048);

const stampTexture = new THREE.CanvasTexture(stampCanvas);
stampTexture.wrapS = THREE.ClampToEdgeWrapping;
stampTexture.wrapT = THREE.ClampToEdgeWrapping;
stampTexture.minFilter = THREE.LinearFilter;
stampTexture.magFilter = THREE.LinearFilter;


// ======= Field Intensity Layer (Heat Map) =======
const fieldCanvas = document.createElement('canvas');
fieldCanvas.width = 256;
fieldCanvas.height = 256;
const fieldCtx = fieldCanvas.getContext('2d', { willReadFrequently: true });
fieldCtx.fillStyle = 'black';
fieldCtx.fillRect(0, 0, 256, 256);

// Field accumulator: tracks intensity (number of stamps per pixel)
const fieldIntensity = new Float32Array(256 * 256);
const fieldTexture = new THREE.CanvasTexture(fieldCanvas);
fieldTexture.wrapS = THREE.ClampToEdgeWrapping;
fieldTexture.wrapT = THREE.ClampToEdgeWrapping;

// ======= Flow Direction Layer =======
const flowCanvas = document.createElement('canvas');
flowCanvas.width = 256;
flowCanvas.height = 256;
const flowCtx = flowCanvas.getContext('2d', { willReadFrequently: true });
flowCtx.fillStyle = 'black';
flowCtx.fillRect(0, 0, 256, 256);

// Flow accumulator: tracks direction (dirX, dirZ) and magnitude
const flowDirX = new Float32Array(256 * 256);
const flowDirZ = new Float32Array(256 * 256);
const flowMagnitude = new Float32Array(256 * 256);
const flowTexture = new THREE.CanvasTexture(flowCanvas);
flowTexture.wrapS = THREE.ClampToEdgeWrapping;
flowTexture.wrapT = THREE.ClampToEdgeWrapping;

// ======= Combined Layer (Flow + Field) =======
const combinedCanvas = document.createElement('canvas');
combinedCanvas.width = 256;
combinedCanvas.height = 256;
const combinedCtx = combinedCanvas.getContext('2d', { willReadFrequently: true });
combinedCtx.fillStyle = 'black';
combinedCtx.fillRect(0, 0, 256, 256);
const combinedTexture = new THREE.CanvasTexture(combinedCanvas);
combinedTexture.wrapS = THREE.ClampToEdgeWrapping;
combinedTexture.wrapT = THREE.ClampToEdgeWrapping;

// ======= Ground Plane =======
// Generate ground texture
const groundTextureCanvas = generateRandomGroundTexture(2048);
const groundTexture = new THREE.CanvasTexture(groundTextureCanvas);
groundTexture.wrapS = THREE.RepeatWrapping;
groundTexture.wrapT = THREE.RepeatWrapping;
groundTexture.repeat.set(2, 2); // Tile 2x2 for more detail

const ground = new THREE.Mesh(
  new THREE.PlaneGeometry(CFG.PLANE_SIZE, CFG.PLANE_SIZE, 100, 100),
  new THREE.MeshStandardMaterial({
    map: groundTexture,
    roughness: 0.9,
    metalness: 0.1,
    side: THREE.FrontSide
  })
);
ground.rotation.x = -Math.PI / 2;
ground.position.y = 0.00;
ground.receiveShadow = true;
scene.add(ground);

// Stamp overlay (invisible by default - stamps captured to texture only)
const stampOverlay = new THREE.Mesh(
  new THREE.PlaneGeometry(CFG.PLANE_SIZE, CFG.PLANE_SIZE),
  new THREE.MeshBasicMaterial({
    map: stampTexture,
    color: 0xffffff,
    transparent: true,
    opacity: 0.8,
    side: THREE.FrontSide,
    depthWrite: false,
    blending: THREE.AdditiveBlending
  })
);
stampOverlay.rotation.x = -Math.PI / 2;
stampOverlay.position.y = 0.01;
stampOverlay.receiveShadow = false;
stampOverlay.castShadow = false;
stampOverlay.visible = false;
scene.add(stampOverlay);

// Field intensity overlay
const fieldOverlay = new THREE.Mesh(
  new THREE.PlaneGeometry(CFG.PLANE_SIZE, CFG.PLANE_SIZE),
  new THREE.MeshBasicMaterial({
    map: fieldTexture,
    transparent: true,
    opacity: 0.7,
    side: THREE.FrontSide,
    depthWrite: false,
    blending: THREE.AdditiveBlending
  })
);
fieldOverlay.rotation.x = -Math.PI / 2;
fieldOverlay.position.y = 0.02;
fieldOverlay.visible = false;
scene.add(fieldOverlay);

// Flow direction overlay
const flowOverlay = new THREE.Mesh(
  new THREE.PlaneGeometry(CFG.PLANE_SIZE, CFG.PLANE_SIZE),
  new THREE.MeshBasicMaterial({
    map: flowTexture,
    transparent: true,
    opacity: 0.7,
    side: THREE.FrontSide,
    depthWrite: false,
    blending: THREE.AdditiveBlending
  })
);
flowOverlay.rotation.x = -Math.PI / 2;
flowOverlay.position.y = 0.03;
flowOverlay.visible = false;
scene.add(flowOverlay);

// Combined overlay (flow + field)
const combinedOverlay = new THREE.Mesh(
  new THREE.PlaneGeometry(CFG.PLANE_SIZE, CFG.PLANE_SIZE),
  new THREE.MeshBasicMaterial({
    map: combinedTexture,
    transparent: true,
    opacity: 0.8,
    side: THREE.FrontSide,
    depthWrite: false,
    blending: THREE.AdditiveBlending
  })
);
combinedOverlay.rotation.x = -Math.PI / 2;
combinedOverlay.position.y = 0.04;
combinedOverlay.visible = false;
scene.add(combinedOverlay);

// ======= Visualization =======
const { obbGroup } = createOBBVisualization(THREE, scene);
const { contactPointsGroup, geomMeanMarker } = createContactVisualization(THREE, CFG);
scene.add(contactPointsGroup);
scene.add(geomMeanMarker);

// ======= PiP Setup =======
const { pip1Ctx, pip2Ctx, pip3Ctx } = setupPiPCanvases(CFG);
const pipManager = new PiPManager(CFG, THREE, renderer, scene);
const pipCam1 = new THREE.OrthographicCamera(-1, 1, 1, -1, 0.01, 200);
const pipCam2 = new THREE.OrthographicCamera(-1, 1, 1, -1, 0.01, 200);
const renderTarget1 = new THREE.WebGLRenderTarget(CFG.PIP_W, CFG.PIP_H);
const renderTarget2 = new THREE.WebGLRenderTarget(CFG.PIP_W, CFG.PIP_H);

// ======= Physics =======
// Use soft body collision configuration for soft body support
const cfg = new A.btSoftBodyRigidBodyCollisionConfiguration();
const dispatcher = new A.btCollisionDispatcher(cfg);
const broadphase = new A.btDbvtBroadphase();
const solver = new A.btSequentialImpulseConstraintSolver();
const softBodySolver = new A.btDefaultSoftBodySolver();
const world = new A.btSoftRigidDynamicsWorld(dispatcher, broadphase, solver, cfg, softBodySolver);
world.setGravity(new A.btVector3(0, -9.81, 0));
world.getWorldInfo().set_m_gravity(new A.btVector3(0, -9.81, 0));

// Static ground body - SINGLE GROUND PLANE
const groundShape = new A.btBoxShape(new A.btVector3(CFG.PLANE_SIZE / 2, 0.5, CFG.PLANE_SIZE / 2));
const gTr = new A.btTransform();
gTr.setIdentity();
gTr.setOrigin(new A.btVector3(0, -0.5, 0));
const gMotion = new A.btDefaultMotionState(gTr);
const gInfo = new A.btRigidBodyConstructionInfo(0, gMotion, groundShape, new A.btVector3(0, 0, 0));
const groundBody = new A.btRigidBody(gInfo);
groundBody.setFriction(0.5); // Lower friction to prevent sticking
groundBody.setRestitution(0.6); // Moderate restitution
groundBody.setRollingFriction(0.1); // Reduce rolling friction
world.addRigidBody(groundBody);

// ======= Reset Boundary Configuration =======
// No physical walls needed - soft bodies and rigid bodies will be reset based on position checks
// This allows soft bodies to pass through without collision while still resetting when out of bounds
const RESET_BOUNDARY = CFG.PLANE_SIZE / 2; // Objects reset when exceeding this distance
const RESET_Y_THRESHOLD = -5; // Objects reset when falling below this Y position

// ======= Wall Obstacle =======
// Create a physical wall obstacle in the middle of the plane
const wallObstacleWidth = 8;
const wallObstacleHeight = 3;
const wallObstacleDepth = 0.5;

const wallObstacleMesh = new THREE.Mesh(
  new THREE.BoxGeometry(wallObstacleWidth, wallObstacleHeight, wallObstacleDepth),
  new THREE.MeshStandardMaterial({
    color: 0x888888,
    roughness: 0.8,
    metalness: 0.2,
    side: THREE.FrontSide
  })
);
wallObstacleMesh.position.set(0, wallObstacleHeight / 2, 0);
wallObstacleMesh.castShadow = true;
wallObstacleMesh.receiveShadow = true;
wallObstacleMesh.visible = false;
scene.add(wallObstacleMesh);


// Physics body for wall obstacle
const wallObstacleShape = new A.btBoxShape(new A.btVector3(wallObstacleWidth / 2, wallObstacleHeight / 2, wallObstacleDepth / 2));
const wallObstacleTr = new A.btTransform();
wallObstacleTr.setIdentity();
wallObstacleTr.setOrigin(new A.btVector3(0, wallObstacleHeight / 2, 0));
const wallObstacleMotion = new A.btDefaultMotionState(wallObstacleTr);
const wallObstacleInfo = new A.btRigidBodyConstructionInfo(0, wallObstacleMotion, wallObstacleShape, new A.btVector3(0, 0, 0));
const wallObstacleBody = new A.btRigidBody(wallObstacleInfo);
wallObstacleBody.setFriction(0.8);
wallObstacleBody.setRestitution(0.7); // Higher restitution for more elastic bouncing
// Don't add to world yet - will be added when checkbox is enabled

// ======= Body Manager =======
const loader = new GLTFLoader();
let mass = 2;
const bodyManager = new BodyManager(THREE, A, scene, world, mass, CFG, loader, generateRandomCubeTexture);

// ======= State Variables =======
let showOBB = false;
let showContacts = false;
let showGeomCenter = false;
let showWallObstacle = false;
let paddingWidthScale = 1.0;
let paddingHeightScale = 1.0;
let paddingDepthTopScale = 0.1;
let paddingDepthBottomScale = 0.1;
let pipEnabled = true;
let showPiP4 = true;
let enableStamping = true;
let stampLineStencil = true;
let showStamps = false;
let useBBoxCenter = false; // Use bounding box center instead of geometric center
let lineIntensityScale = 1.0; // Intensity scale for line stencil (1.0 = 100%)
let useCustomPattern = false; // Use custom pattern instead of generated lines
let enableSynthetic = true; // Enable synthetic contact augmentation
let enableField = true;
let enableFlow = true;
let enableCombined = true;
let lastStampTime = 0;
let stampInterval = 50; // Stamp interval in milliseconds
let isPaused = false;
let forceX = 0, forceY = 0, forceZ = 0;
let gravity = 9.81;
let timestepHz = 60; // Physics update frequency
let maxSubsteps = 10; // Maximum substeps per frame
let fixedTimestep = 120; // Fixed timestep in Hz
let bboxAlgorithm = 'aabb';
let lastOBB = null;
let contactSamples = [];
let previousVelocity = new THREE.Vector3(0, 0, 0);
let previousAngle = 0;
const ANGLE_STABILITY_THRESHOLD = 25 * Math.PI / 180;
const MIN_CONTACTS_FOR_STABLE_BOX = 4;
let softGroundThreshold = 0.15; // Threshold for soft body ground contact detection

// Stamp parameters (filtering removed - stamps on every interval)

// Field/Flow parameters
let fieldGain = 0.02;
let flowAlpha = 0.15;
let similarityThreshold = 0.5; // Cosine similarity threshold

// Helper functions for field and flow
function worldToFieldPixel(worldX, worldZ) {
  const x = ((worldX + CFG.PLANE_SIZE / 2) / CFG.PLANE_SIZE) * 256;
  const y = ((worldZ + CFG.PLANE_SIZE / 2) / CFG.PLANE_SIZE) * 256;
  return { x: Math.floor(Math.max(0, Math.min(255, x))), y: Math.floor(Math.max(0, Math.min(255, y))) };
}

function accumulateField(worldX, worldZ, normalForce = 1.0, radius = 10) {
  const center = worldToFieldPixel(worldX, worldZ);
  const radiusSq = radius * radius;
  
  // Normalize force to reasonable range (reference: 2kg at 9.81 m/s² = 19.62 N)
  const referenceForce = 2.0 * 9.81; // 19.62 N
  const forceMultiplier = Math.sqrt(normalForce / referenceForce); // Use sqrt for more gradual scaling
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
          fieldIntensity[idx] = Math.min(10.0, fieldIntensity[idx] + effectiveGain * falloff);
        }
      }
    }
  }
}

function accumulateFlow(worldX, worldZ, velX, velZ, radius = 20) {
  const center = worldToFieldPixel(worldX, worldZ);
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
          
          // Calculate cosine similarity with existing flow
          const existingMag = flowMagnitude[idx];
          let similarity = 1.0;
          
          if (existingMag > 0.01) {
            const existingDirX = flowDirX[idx] / existingMag;
            const existingDirZ = flowDirZ[idx] / existingMag;
            similarity = normVelX * existingDirX + normVelZ * existingDirZ;
          }
          
          // Only accumulate if similarity is above threshold
          if (similarity > similarityThreshold) {
            flowDirX[idx] += flowAlpha * normVelX * falloff * velMag;
            flowDirZ[idx] += flowAlpha * normVelZ * falloff * velMag;
            flowMagnitude[idx] = Math.sqrt(flowDirX[idx] * flowDirX[idx] + flowDirZ[idx] * flowDirZ[idx]);
          }
        }
      }
    }
  }
}

function renderField() {
  const imgData = fieldCtx.createImageData(256, 256);
  const data = imgData.data;
  
  // Fixed normalization: 500 physical stamps = white (truly independent of fieldGain)
  // Convert accumulated intensity back to equivalent stamp count, then normalize
  const PASSES_FOR_WHITE = 500;
  
  for (let i = 0; i < fieldIntensity.length; i++) {
    // Calculate equivalent number of stamps (divide by current gain to get count)
    const equivalentStamps = fieldIntensity[i] / fieldGain;
    
    // Normalize: 500 stamps = 1.0 (white)
    const normalized = Math.min(1.0, equivalentStamps / PASSES_FOR_WHITE);
    const gray = Math.floor(255 * normalized);
    
    const idx = i * 4;
    // Grayscale: black (0) to white (255)
    data[idx] = gray;
    data[idx + 1] = gray;
    data[idx + 2] = gray;
    data[idx + 3] = Math.floor(255 * normalized); // Alpha matches intensity
  }
  
  fieldCtx.putImageData(imgData, 0, 0);
  fieldTexture.needsUpdate = true;
}

function renderFlow() {
  const imgData = flowCtx.createImageData(256, 256);
  const data = imgData.data;
  
  // Find max magnitude for normalization
  let maxMag = 0;
  for (let i = 0; i < flowMagnitude.length; i++) {
    if (flowMagnitude[i] > maxMag) maxMag = flowMagnitude[i];
  }
  
  // Avoid division by zero
  if (maxMag < 0.01) maxMag = 1.0;
  
  for (let i = 0; i < flowMagnitude.length; i++) {
    const mag = flowMagnitude[i];
    const idx = i * 4;
    
    if (mag > 0.001) {
      // Normalize direction vector
      const dirX = flowDirX[i] / mag;
      const dirZ = flowDirZ[i] / mag;
      
      // Direction to hue (0-1) - standard flow map convention (V flipped)
      const angle = Math.atan2(dirZ, dirX); // V axis flipped
      const hue = (angle + Math.PI) / (2 * Math.PI); // 0-1
      
      // Normalize magnitude to 0-1 range
      const normalizedMag = Math.min(1.0, mag / maxMag);
      
      // Standard flow map: Hue = direction, Saturation = intensity, Value = 1
      const h = hue;
      const s = normalizedMag; // Intensity in saturation
      const v = 1.0; // Full brightness
      
      // HSV to RGB - robust conversion
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
      data[idx + 3] = Math.floor(normalizedMag * 255); // Alpha = intensity
    } else {
      // No flow - transparent
      data[idx] = 0;
      data[idx + 1] = 0;
      data[idx + 2] = 0;
      data[idx + 3] = 0;
    }
  }
  
  flowCtx.putImageData(imgData, 0, 0);
  flowTexture.needsUpdate = true;
}

function renderCombined() {
  const imgData = combinedCtx.createImageData(256, 256);
  const data = imgData.data;
  
  // Find max flow magnitude for normalization
  let maxMag = 0;
  for (let i = 0; i < flowMagnitude.length; i++) {
    if (flowMagnitude[i] > maxMag) maxMag = flowMagnitude[i];
  }
  if (maxMag < 0.01) maxMag = 1.0;
  
  // Fixed normalization for field
  const PASSES_FOR_WHITE = 500;
  
  for (let i = 0; i < 256 * 256; i++) {
    const idx = i * 4;
    
    // Get field intensity (0-1)
    const equivalentStamps = fieldIntensity[i] / fieldGain;
    const fieldValue = Math.min(1.0, equivalentStamps / PASSES_FOR_WHITE);
    
    // Get flow data
    const mag = flowMagnitude[i];
    
    if (mag > 0.001 && fieldValue > 0.01) {
      // Both flow and field present - combine them
      const dirX = flowDirX[i] / mag;
      const dirZ = flowDirZ[i] / mag;
      
      // Flow direction to hue (V-flipped)
      const angle = Math.atan2(dirZ, dirX);
      const hue = (angle + Math.PI) / (2 * Math.PI); // 0-1
      
      // Normalize flow magnitude
      const normalizedMag = Math.min(1.0, mag / maxMag);
      
      // Combined visualization:
      // - Hue = flow direction
      // - Saturation = flow magnitude
      // - Value = field intensity (how many times visited)
      const h = hue;
      const s = normalizedMag * 0.8; // Flow strength as saturation
      const v = fieldValue; // Field intensity as brightness
      
      // HSV to RGB
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
      data[idx + 3] = Math.floor(fieldValue * 255); // Alpha based on field
    } else if (fieldValue > 0.01) {
      // Only field, no flow - show as white grayscale
      const gray = Math.floor(255 * fieldValue);
      data[idx] = gray;
      data[idx + 1] = gray;
      data[idx + 2] = gray;
      data[idx + 3] = Math.floor(fieldValue * 255);
    } else {
      // No data - transparent
      data[idx] = 0;
      data[idx + 1] = 0;
      data[idx + 2] = 0;
      data[idx + 3] = 0;
    }
  }
  
  combinedCtx.putImageData(imgData, 0, 0);
  combinedTexture.needsUpdate = true;
}

// ======= UI Event Handlers =======
document.getElementById('loadingScreen').style.display = 'none';
document.getElementById('hud').style.display = 'flex';

// Body controls
document.getElementById('start').onclick = () => {
  bodyManager.start();
  isPaused = false;
  document.getElementById('pause').textContent = 'Pause';
};

document.getElementById('reset').onclick = () => {
  bodyManager.reset();
  isPaused = false;
  document.getElementById('pause').textContent = 'Pause';
};

document.getElementById('pause').onclick = () => {
  isPaused = !isPaused;
  document.getElementById('pause').textContent = isPaused ? 'Resume' : 'Pause';
};

document.getElementById('shape').onchange = (e) => {
  bodyManager.setShapeType(e.target.value);
  document.getElementById('customBodyRow').style.display =
    (e.target.value === 'custom') ? 'flex' : 'none';
  // Show/hide soft body controls
  document.getElementById('softBodySection').style.display =
    (e.target.value === 'cubeSoft') ? 'block' : 'none';
  if (e.target.value !== 'custom') bodyManager.start();
};

document.getElementById('bodyFile').onchange = async (e) => {
  if (e.target.files && e.target.files[0]) {
    bodyManager.setCustomBodyURL(URL.createObjectURL(e.target.files[0]));
    await bodyManager.start();
  }
};

// Mass control
document.getElementById('mass').oninput = (e) => {
  mass = parseFloat(e.target.value);
  // Format mass display (show 1 decimal for <10, 0 decimals for >=10)
  const displayValue = mass < 10 ? mass.toFixed(1) : Math.round(mass).toString();
  document.getElementById('massValue').textContent = displayValue + ' kg';
  bodyManager.setMass(mass);
  // Restart body to apply new mass
  bodyManager.start();
};

// Bounding box algorithm
document.getElementById('bboxAlgo').onchange = (e) => {
  bboxAlgorithm = e.target.value;
  document.getElementById('bboxType').textContent = e.target.options[e.target.selectedIndex].text;
};

// Padding controls
document.getElementById('paddingWidth').oninput = (e) => {
  paddingWidthScale = parseInt(e.target.value) / 100;
  document.getElementById('paddingWidthVal').textContent = paddingWidthScale.toFixed(2) + 'x';
};

document.getElementById('paddingHeight').oninput = (e) => {
  paddingHeightScale = parseInt(e.target.value) / 100;
  document.getElementById('paddingHeightVal').textContent = paddingHeightScale.toFixed(2) + 'x';
};

document.getElementById('paddingDepthTop').oninput = (e) => {
  paddingDepthTopScale = parseInt(e.target.value) / 100;
  document.getElementById('paddingDepthTopVal').textContent = paddingDepthTopScale.toFixed(2) + 'x';
};

document.getElementById('paddingDepthBottom').oninput = (e) => {
  paddingDepthBottomScale = parseInt(e.target.value) / 100;
  document.getElementById('paddingDepthBottomVal').textContent = paddingDepthBottomScale.toFixed(2) + 'x';
};

// Speed controls
document.getElementById('speedX').oninput = (e) => {
  const s = parseInt(e.target.value);
  document.getElementById('speedXVal').textContent = String(s);
  bodyManager.setSpeed(s, bodyManager.speedZ);
  const dynBody = bodyManager.getBody();
  const dynMesh = bodyManager.getMesh();
  
  if (dynBody) {
    if (dynMesh && dynMesh.userData.isSoftBody) {
      // For soft bodies, set velocity on all nodes
      const nodes = dynBody.get_m_nodes();
      const nodeCount = nodes.size();
      for (let i = 0; i < nodeCount; i++) {
        const node = nodes.at(i);
        const currentVel = node.get_m_v();
        const newVel = new A.btVector3(s, currentVel.y(), bodyManager.speedZ);
        node.set_m_v(newVel);
      }
      dynBody.setActivationState(4);
    } else {
      // For rigid bodies
      const v = dynBody.getLinearVelocity();
      dynBody.setLinearVelocity(new A.btVector3(s, v.y(), bodyManager.speedZ));
      dynBody.activate();
      A.destroy(v);
    }
  }
};

document.getElementById('speedZ').oninput = (e) => {
  const s = parseInt(e.target.value);
  document.getElementById('speedZVal').textContent = String(s);
  bodyManager.setSpeed(bodyManager.speedX, s);
  const dynBody = bodyManager.getBody();
  const dynMesh = bodyManager.getMesh();
  
  if (dynBody) {
    if (dynMesh && dynMesh.userData.isSoftBody) {
      // For soft bodies, set velocity on all nodes
      const nodes = dynBody.get_m_nodes();
      const nodeCount = nodes.size();
      for (let i = 0; i < nodeCount; i++) {
        const node = nodes.at(i);
        const currentVel = node.get_m_v();
        const newVel = new A.btVector3(bodyManager.speedX, currentVel.y(), s);
        node.set_m_v(newVel);
      }
      dynBody.setActivationState(4);
    } else {
      // For rigid bodies
      const v = dynBody.getLinearVelocity();
      dynBody.setLinearVelocity(new A.btVector3(bodyManager.speedX, v.y(), s));
      dynBody.activate();
      A.destroy(v);
    }
  }
};

// Force controls
document.getElementById('forceX').oninput = (e) => {
  forceX = parseInt(e.target.value);
  document.getElementById('forceXVal').textContent = String(forceX);
  const dynBody = bodyManager.getBody();
  if (dynBody) dynBody.activate();
};

document.getElementById('forceY').oninput = (e) => {
  forceY = parseInt(e.target.value);
  document.getElementById('forceYVal').textContent = String(forceY);
  const dynBody = bodyManager.getBody();
  if (dynBody) dynBody.activate();
};

document.getElementById('forceZ').oninput = (e) => {
  forceZ = parseInt(e.target.value);
  document.getElementById('forceZVal').textContent = String(forceZ);
  const dynBody = bodyManager.getBody();
  if (dynBody) dynBody.activate();
};

// Physics parameters
document.getElementById('gravity').oninput = (e) => {
  gravity = parseInt(e.target.value) / 100;
  document.getElementById('gravityVal').textContent = gravity.toFixed(2);
  world.setGravity(new A.btVector3(0, -gravity, 0));
};

document.getElementById('friction').oninput = (e) => {
  const friction = parseFloat(e.target.value) || 0;
  document.getElementById('frictionVal').textContent = friction.toFixed(2);
  bodyManager.setFriction(friction);
};

document.getElementById('restitution').oninput = (e) => {
  const restitution = parseFloat(e.target.value) || 0;
  document.getElementById('restitutionVal').textContent = restitution.toFixed(2);
  bodyManager.setRestitution(restitution);
};

document.getElementById('linearDamping').oninput = (e) => {
  const damping = parseInt(e.target.value) / 100;
  document.getElementById('linearDampingVal').textContent = damping.toFixed(2);
  bodyManager.setLinearDamping(damping);
};

document.getElementById('angularDamping').oninput = (e) => {
  const damping = parseInt(e.target.value) / 100;
  document.getElementById('angularDampingVal').textContent = damping.toFixed(2);
  bodyManager.setAngularDamping(damping);
};

// Physics timestep controls
document.getElementById('timestepHz').oninput = (e) => {
  timestepHz = parseInt(e.target.value);
  document.getElementById('timestepHzVal').textContent = timestepHz + ' Hz';
};

document.getElementById('maxSubsteps').oninput = (e) => {
  maxSubsteps = parseInt(e.target.value);
  document.getElementById('maxSubstepsVal').textContent = maxSubsteps.toString();
};

document.getElementById('fixedTimestep').oninput = (e) => {
  fixedTimestep = parseInt(e.target.value);
  document.getElementById('fixedTimestepVal').textContent = fixedTimestep + ' Hz';
};

// Soft body controls
document.getElementById('softStiffness').oninput = (e) => {
  const stiffness = parseInt(e.target.value) / 100;
  document.getElementById('softStiffnessVal').textContent = stiffness.toFixed(2);
  bodyManager.setSoftStiffness(stiffness);
};

document.getElementById('softDamping').oninput = (e) => {
  const damping = parseInt(e.target.value) / 100;
  document.getElementById('softDampingVal').textContent = damping.toFixed(2);
  bodyManager.setSoftDamping(damping);
};

document.getElementById('softPressure').oninput = (e) => {
  const pressure = parseInt(e.target.value) / 100;
  document.getElementById('softPressureVal').textContent = pressure.toFixed(2);
  bodyManager.setSoftPressure(pressure);
};

document.getElementById('softIterations').oninput = (e) => {
  const iterations = parseInt(e.target.value);
  document.getElementById('softIterationsVal').textContent = iterations.toString();
  bodyManager.setSoftIterations(iterations);
};

document.getElementById('softContactHardness').oninput = (e) => {
  const hardness = parseInt(e.target.value) / 100;
  document.getElementById('softContactHardnessVal').textContent = hardness.toFixed(2);
  bodyManager.setSoftContactHardness(hardness);
};

document.getElementById('softGroundThreshold').oninput = (e) => {
  softGroundThreshold = parseInt(e.target.value) / 100;
  document.getElementById('softGroundThresholdVal').textContent = softGroundThreshold.toFixed(2);
};

// Visualization toggles
const pipEnabledEl = document.getElementById('pipEnabled');
if (pipEnabledEl) {
  pipEnabledEl.onchange = (e) => {
    pipEnabled = e.target.checked;
    document.getElementById('pipContainer').style.display = pipEnabled ? 'flex' : 'none';
  };
}

const showOBBEl = document.getElementById('showOBB');
if (showOBBEl) {
  showOBBEl.onchange = (e) => {
    showOBB = e.target.checked;
    if (obbGroup) obbGroup.visible = showOBB;
  };
}

const showPiP4El = document.getElementById('showPiP4');
if (showPiP4El) {
  showPiP4El.onchange = (e) => {
    showPiP4 = e.target.checked;
    document.getElementById('pip4').style.display = showPiP4 ? 'block' : 'none';
  };
}

const showContactsEl = document.getElementById('showContacts');
if (showContactsEl) {
  showContactsEl.onchange = (e) => {
    showContacts = e.target.checked;
    updateContactPoints(contactPointsGroup, contactSamples, showContacts, CFG, THREE);
  };
}

const showGeomCenterEl = document.getElementById('showGeomCenter');
if (showGeomCenterEl) {
  showGeomCenterEl.onchange = (e) => {
    showGeomCenter = e.target.checked;
    const result = sampleContacts(dispatcher, THREE, bodyManager.getMesh(), MIN_CONTACTS_FOR_STABLE_BOX, softGroundThreshold);
    updateGeomMeanMarker(geomMeanMarker, result.geometricCenter, showGeomCenter);
  };
}


const showWallObstacleEl = document.getElementById('showWallObstacle');
if (showWallObstacleEl) {
  showWallObstacleEl.onchange = (e) => {
    showWallObstacle = e.target.checked;
    wallObstacleMesh.visible = showWallObstacle;
    
    // Add or remove wall from physics world
    if (showWallObstacle) {
      world.addRigidBody(wallObstacleBody);
    } else {
      world.removeRigidBody(wallObstacleBody);
    }
  };
}


// Stamping is always enabled (UI hidden)

// Stamping controls
const showStampsEl = document.getElementById('showStamps');
if (showStampsEl) {
  showStampsEl.onchange = (e) => {
    showStamps = e.target.checked;
    stampOverlay.visible = showStamps;
  };
}

const stampLineStencilEl = document.getElementById('stampLineStencil');
if (stampLineStencilEl) {
  stampLineStencilEl.onchange = (e) => {
    stampLineStencil = e.target.checked;
  };
}

const clearStampsEl = document.getElementById('clearStamps');
if (clearStampsEl) {
  clearStampsEl.onclick = () => {
    stampCtx.clearRect(0, 0, stampCanvas.width, stampCanvas.height);
    stampTexture.needsUpdate = true;
  };
}

const saveStampsEl = document.getElementById('saveStamps');
if (saveStampsEl) {
  saveStampsEl.onclick = () => {
    saveCanvasAsPNG(stampCanvas, 'stamps.png');
  };
}

const clearPiP4StencilEl = document.getElementById('clearPiP4Stencil');
if (clearPiP4StencilEl) {
  clearPiP4StencilEl.onclick = () => {
    if (pipManager && pipManager.pip4) {
      pipManager.pip4.clearStencil();
    }
  };
}

// Line stencil controls
const lineSpacingEl = document.getElementById('lineSpacing');
if (lineSpacingEl) {
  lineSpacingEl.oninput = (e) => {
    const spacing = parseInt(e.target.value);
    document.getElementById('lineSpacingVal').textContent = spacing + ' px';
    if (pipManager && pipManager.pip4) {
      pipManager.pip4.setLineSpacing(spacing);
    }
  };
}

const lineWidthEl = document.getElementById('lineWidth');
if (lineWidthEl) {
  lineWidthEl.oninput = (e) => {
    const width = parseInt(e.target.value);
    document.getElementById('lineWidthVal').textContent = width + ' px';
    if (pipManager && pipManager.pip4) {
      pipManager.pip4.setLineWidth(width);
    }
  };
}

const lineIntensityEl = document.getElementById('lineIntensity');
if (lineIntensityEl) {
  lineIntensityEl.oninput = (e) => {
    const intensity = parseInt(e.target.value);
    lineIntensityScale = intensity / 100; // Convert percentage to decimal
    document.getElementById('lineIntensityVal').textContent = intensity + '%';
  };
}

const useCustomPatternEl = document.getElementById('useCustomPattern');
if (useCustomPatternEl) {
  useCustomPatternEl.onchange = (e) => {
    useCustomPattern = e.target.checked;
    if (pipManager && pipManager.pip4) {
      pipManager.pip4.setUseCustomPattern(useCustomPattern);
    }
  };
}

const selectPatternEl = document.getElementById('selectPattern');
if (selectPatternEl) {
  selectPatternEl.onclick = () => {
    document.getElementById('patternFile').click();
  };
}

const patternFileEl = document.getElementById('patternFile');
if (patternFileEl) {
  patternFileEl.onchange = async (e) => {
    if (e.target.files && e.target.files[0]) {
      try {
        if (pipManager && pipManager.pip4) {
          await pipManager.pip4.loadCustomPattern(e.target.files[0]);
          useCustomPattern = true;
          document.getElementById('useCustomPattern').checked = true;
          pipManager.pip4.setUseCustomPattern(true);
        }
      } catch (error) {
        console.error('Failed to load custom pattern:', error);
        alert('Failed to load custom pattern. Please make sure it\'s a valid PNG file.');
      }
    }
  };
}


const stampIntervalEl = document.getElementById('stampInterval');
if (stampIntervalEl) {
  stampIntervalEl.oninput = (e) => {
    stampInterval = parseInt(e.target.value);
    document.getElementById('stampIntervalVal').textContent = stampInterval + ' ms';
  };
}

const useBBoxCenterEl = document.getElementById('useBBoxCenter');
if (useBBoxCenterEl) {
  useBBoxCenterEl.onchange = (e) => {
    useBBoxCenter = e.target.checked;
  };
}

const enableSyntheticEl = document.getElementById('enableSynthetic');
if (enableSyntheticEl) {
  enableSyntheticEl.onchange = (e) => {
    enableSynthetic = e.target.checked;
  };
}

// Field layer controls
const enableFieldEl = document.getElementById('enableField');
if (enableFieldEl) {
  enableFieldEl.onchange = (e) => {
    enableField = e.target.checked;
  };
}

const showFieldEl = document.getElementById('showField');
if (showFieldEl) {
  showFieldEl.onchange = (e) => {
    fieldOverlay.visible = e.target.checked;
  };
}

const clearFieldEl = document.getElementById('clearField');
if (clearFieldEl) {
  clearFieldEl.onclick = () => {
    fieldIntensity.fill(0);
    renderField();
  };
}

const saveFieldEl = document.getElementById('saveField');
if (saveFieldEl) {
  saveFieldEl.onclick = () => {
    saveCanvasAsPNG(fieldCanvas, 'field_intensity.png');
  };
}

const fieldGainEl = document.getElementById('fieldGain');
if (fieldGainEl) {
  fieldGainEl.oninput = (e) => {
    fieldGain = parseInt(e.target.value) / 100;
    document.getElementById('fieldGainValue').textContent = fieldGain.toFixed(2);
  };
}

// Flow layer controls
const enableFlowEl = document.getElementById('enableFlow');
if (enableFlowEl) {
  enableFlowEl.onchange = (e) => {
    enableFlow = e.target.checked;
  };
}

const showFlowEl = document.getElementById('showFlow');
if (showFlowEl) {
  showFlowEl.onchange = (e) => {
    flowOverlay.visible = e.target.checked;
  };
}

const clearFlowEl = document.getElementById('clearFlow');
if (clearFlowEl) {
  clearFlowEl.onclick = () => {
    flowDirX.fill(0);
    flowDirZ.fill(0);
    flowMagnitude.fill(0);
    renderFlow();
  };
}

const saveFlowEl = document.getElementById('saveFlow');
if (saveFlowEl) {
  saveFlowEl.onclick = () => {
    saveCanvasAsPNG(flowCanvas, 'flow_direction.png');
  };
}

const flowAlphaEl = document.getElementById('flowAlpha');
if (flowAlphaEl) {
  flowAlphaEl.oninput = (e) => {
    flowAlpha = parseInt(e.target.value) / 100;
    document.getElementById('flowAlphaValue').textContent = flowAlpha.toFixed(2);
  };
}

const flowSimilarityEl = document.getElementById('flowSimilarity');
if (flowSimilarityEl) {
  flowSimilarityEl.oninput = (e) => {
    similarityThreshold = parseInt(e.target.value) / 100;
    document.getElementById('flowSimilarityValue').textContent = similarityThreshold.toFixed(2);
  };
}

// Combined layer controls
const enableCombinedEl = document.getElementById('enableCombined');
if (enableCombinedEl) {
  enableCombinedEl.onchange = (e) => {
    enableCombined = e.target.checked;
  };
}

const showCombinedEl = document.getElementById('showCombined');
if (showCombinedEl) {
  showCombinedEl.onchange = (e) => {
    combinedOverlay.visible = e.target.checked;
  };
}

const clearCombinedEl = document.getElementById('clearCombined');
if (clearCombinedEl) {
  clearCombinedEl.onclick = () => {
    fieldIntensity.fill(0);
    flowDirX.fill(0);
    flowDirZ.fill(0);
    flowMagnitude.fill(0);
    renderField();
    renderFlow();
    renderCombined();
  };
}

const saveCombinedEl = document.getElementById('saveCombined');
if (saveCombinedEl) {
  saveCombinedEl.onclick = () => {
    saveCanvasAsPNG(combinedCanvas, 'combined_flow_field.png');
  };
}

// Export controls
const saveIntersectionEl = document.getElementById('saveIntersection');
if (saveIntersectionEl) {
  saveIntersectionEl.onclick = () => {
    const pip3Canvas = document.getElementById('pip3Canvas');
    if (pip3Canvas) {
      saveCanvasAsPNG(pip3Canvas, 'intersection.png');
    }
  };
}

// Window resize
addEventListener('resize', () => {
  camera.aspect = innerWidth / innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(innerWidth, innerHeight);
});

// ======= Animation Loop =======
let frame = 0;
let lastT = performance.now();
let lastFrameTime = performance.now();
let lastPipRender = 0;
let contactResult = { 
  count: 0, 
  geometricCenter: { x: 0, z: 0 }, 
  avgContactPoint: { x: 0, y: 0, z: 0 },
  avgContactNormal: { x: 0, y: 1, z: 0 }
};
const tmpTr = new A.btTransform();

function animate() {
  requestAnimationFrame(animate);
  frame++;

  const now = performance.now();
  
  // Update FPS
  if (now - lastT > 500) {
    const fps = Math.round(1000 / (now - lastT) * frame);
    document.getElementById('fps').textContent = String(fps);
    lastT = now;
    frame = 0;
  }
  document.getElementById('frame').textContent = String(frame);

  // Get dynamic body reference
  const dynBody = bodyManager.getBody();
  const dynMesh = bodyManager.getMesh();
  
  // Skip physics if paused
  if (!isPaused) {
    // Apply forces and maintain constant speed
    const dt = Math.min(1 / 30, Math.max(1 / 240, (now - lastFrameTime) / 1000));
    lastFrameTime = now;
    
    if (dynBody && dynMesh) {
      if (dynMesh.userData.isSoftBody) {
        const nodes = dynBody.get_m_nodes();
        const nodeCount = nodes.size();
        
        // Calculate current average velocity
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
        
        // Get target speeds
        const targetSpeedX = bodyManager.speedX;
        const targetSpeedZ = bodyManager.speedZ;
        
        // Calculate velocity corrections needed
        const speedDiffX = targetSpeedX - avgVx;
        const speedDiffZ = targetSpeedZ - avgVz;
        
        // Calculate force accelerations once (outside loop for efficiency)
        let accelX = 0, accelY = 0, accelZ = 0;
        if (forceX !== 0 || forceY !== 0 || forceZ !== 0) {
          accelX = forceX / mass;
          accelY = forceY / mass;
          accelZ = forceZ / mass;
        }
        
        // Apply corrections and forces to all nodes
        for (let i = 0; i < nodeCount; i++) {
          const node = nodes.at(i);
          const currentVel = node.get_m_v();
          
          // Apply constant speed maintenance (gradual correction for X and Z only)
          const speedCorrectionStrength = 0.1; // 10% correction per frame
          let newVelX = currentVel.x() + speedDiffX * speedCorrectionStrength;
          let newVelY = currentVel.y(); // Keep Y velocity as is (affected only by forces and gravity)
          let newVelZ = currentVel.z() + speedDiffZ * speedCorrectionStrength;
          
          // Apply constant force effect directly to velocity (like continuous acceleration)
          if (forceX !== 0 || forceY !== 0 || forceZ !== 0) {
            newVelX += accelX * dt;
            newVelY += accelY * dt;
            newVelZ += accelZ * dt;
          }
          
          // CRITICAL: Reuse single btVector3 object instead of creating new ones
          // This prevents memory leak (729 nodes × 60fps = 43,740 objects/second!)
          const newVel = new A.btVector3(newVelX, newVelY, newVelZ);
          node.set_m_v(newVel);
          A.destroy(newVel); // IMPORTANT: Destroy after use to prevent memory leak!
        }
        
        dynBody.setActivationState(4);
      } else {
        // For rigid bodies - apply forces only
        if (forceX !== 0 || forceY !== 0 || forceZ !== 0) {
          const impulse = new A.btVector3(forceX * dt, forceY * dt, forceZ * dt);
          dynBody.applyCentralImpulse(impulse);
          A.destroy(impulse);
          dynBody.activate();
        }
      }
    }

    // Step physics with configurable timestep
    world.stepSimulation(1 / timestepHz, maxSubsteps, 1 / fixedTimestep);
  }
  
  if (dynBody && dynMesh) {
    // Check if this is a soft body
    if (dynMesh.userData.isSoftBody && dynMesh.userData.updateSoftBodyMesh) {
      // Update soft body mesh vertices using the provided update function
      dynMesh.userData.updateSoftBodyMesh();
      dynMesh.visible = true;
      
      // Check bounds using center of mass (average position of all nodes)
      const softBody = dynMesh.userData.physicsBody;
      const nodes = softBody.get_m_nodes();
      const nodeCount = nodes.size();
      
      if (nodeCount > 0) {
        // Calculate center of mass
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
        
        // Reset if center of mass is outside reset boundaries
        if (Math.abs(avgX) > RESET_BOUNDARY || 
            Math.abs(avgZ) > RESET_BOUNDARY ||
            avgY < RESET_Y_THRESHOLD) {
          bodyManager.reset();
        }
      }
    } else {
      // Regular rigid body
      dynBody.getMotionState().getWorldTransform(tmpTr);
      const p = tmpTr.getOrigin();
      const q = tmpTr.getRotation();
      dynMesh.position.set(p.x(), p.y(), p.z());
      dynMesh.quaternion.set(q.x(), q.y(), q.z(), q.w());
      dynMesh.visible = true;
      
      // Reset if out of bounds (check X, Y, Z axes)
      if (Math.abs(p.x()) > RESET_BOUNDARY || 
          Math.abs(p.z()) > RESET_BOUNDARY ||
          p.y() < RESET_Y_THRESHOLD) {
        bodyManager.reset();
      }
    }
  }

  // Sample contacts (pass soft body ground threshold)
  const newContactResult = sampleContacts(dispatcher, THREE, dynMesh, MIN_CONTACTS_FOR_STABLE_BOX, softGroundThreshold);
  contactSamples = newContactResult.contactSamples;
  contactResult.count = newContactResult.count;
  contactResult.filteredCount = newContactResult.filteredCount;
  contactResult.realContactCount = newContactResult.realContactCount;
  contactResult.syntheticCount = newContactResult.syntheticCount;
  contactResult.geometricCenter = newContactResult.geometricCenter;
  contactResult.avgContactPoint = newContactResult.avgContactPoint;
  contactResult.avgContactNormal = newContactResult.avgContactNormal;
  
  // Update stats
  // Display filtered count for more accurate representation
  const statsDisplayCount = contactResult.filteredCount || 0;
  document.getElementById('contacts').textContent = String(statsDisplayCount);

  // Update separate real/synthetic contact counts in UI
  const realContactsEl = document.getElementById('realContacts');
  const syntheticContactsEl = document.getElementById('syntheticContacts');

  if (realContactsEl) {
    realContactsEl.textContent = String(contactResult.realContactCount || 0);
  }

  if (syntheticContactsEl) {
    syntheticContactsEl.textContent = String(contactResult.syntheticCount || 0);
    // Style differently if synthetic contacts are present
    if (contactResult.syntheticCount > 0) {
      syntheticContactsEl.style.fontWeight = 'bold';
    } else {
      syntheticContactsEl.style.fontWeight = 'normal';
    }
  }

  if (statsDisplayCount > 0) {
    document.getElementById('gcenter').textContent =
      `(${contactResult.geometricCenter.x.toFixed(3)}, ${contactResult.geometricCenter.z.toFixed(3)})`;
  } else {
    document.getElementById('gcenter').textContent = '—';
  }
  
  // Update velocity display (only update every 10 frames to reduce overhead)
  if (frame % 10 === 0 && dynBody && dynMesh) {
    if (dynMesh.userData.isSoftBody) {
      // For soft bodies, show average velocity
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
      // For rigid bodies, show linear velocity
      const lv = dynBody.getLinearVelocity();
      const velMag = Math.sqrt(lv.x() * lv.x() + lv.y() * lv.y() + lv.z() * lv.z());
      document.getElementById('velocity').textContent = 
        `${velMag.toFixed(2)} m/s (${lv.x().toFixed(1)}, ${lv.y().toFixed(1)}, ${lv.z().toFixed(1)})`;
      A.destroy(lv);
    }
  } else {
    document.getElementById('velocity').textContent = '—';
  }
  
  // Update angular velocity display (only update every 10 frames)
  if (frame % 10 === 0 && dynBody && dynMesh) {
    if (!dynMesh.userData.isSoftBody) {
      // Only rigid bodies have angular velocity
      const av = dynBody.getAngularVelocity();
      const angVelMag = Math.sqrt(av.x() * av.x() + av.y() * av.y() + av.z() * av.z());
      const rpm = (angVelMag * 60) / (2 * Math.PI); // Convert rad/s to RPM
      document.getElementById('angularVel').textContent = 
        `${angVelMag.toFixed(2)} rad/s (${rpm.toFixed(0)} RPM)`;
      A.destroy(av);
    } else {
      document.getElementById('angularVel').textContent = 'N/A (soft body)';
    }
  } else if (!dynBody) {
    document.getElementById('angularVel').textContent = '—';
  }
  
  // Update applied force display
  const totalForce = Math.sqrt(forceX * forceX + forceY * forceY + forceZ * forceZ);
  if (totalForce > 0) {
    document.getElementById('appliedForce').textContent = 
      `${totalForce.toFixed(1)} N (${forceX}, ${forceY}, ${forceZ})`;
  } else {
    document.getElementById('appliedForce').textContent = '0 N';
  }

  // Update visualization
  // Use all contact samples (already filtered) instead of slicing by raw count
  updateContactPoints(contactPointsGroup, contactSamples, showContacts, CFG, THREE);
  const displayCount = contactResult.filteredCount || contactResult.count || 0;
  updateGeomMeanMarker(geomMeanMarker, displayCount > 0 ? contactResult.geometricCenter : null, showGeomCenter);

  // Compute bounding box
  if (dynMesh && contactSamples.length > 0) {
    const isSoftBody = dynMesh.userData.isSoftBody || false;
    const obb = computeBoundingBox(
      contactSamples,
      contactResult.avgContactPoint,
      contactResult.avgContactNormal,
      bboxAlgorithm,
      CFG,
      THREE,
      dynBody,
      A,
      lastOBB,
      previousVelocity,
      previousAngle,
      ANGLE_STABILITY_THRESHOLD,
      isSoftBody
    );
    
    if (obb) {
      lastOBB = obb;
      updateOBBVisualization(obbGroup, obb, paddingWidthScale, paddingHeightScale, paddingDepthTopScale, paddingDepthBottomScale, CFG, THREE);
      obbGroup.visible = showOBB;
      const angDeg = (obb.theta * 180 / Math.PI).toFixed(2);
      document.getElementById('obbAng').textContent = angDeg + '°';
    }
  } else {
    lastOBB = null;
    if (obbGroup) obbGroup.visible = false;
    document.getElementById('obbAng').textContent = '—';
  }

  // Render main scene
  renderer.render(scene, camera);

  // Render PiP views
    
    // Calculate rotation angle from velocity for PiP camera orientation
    let cameraRotation = null;
    if (dynBody && lastOBB) {
      if (dynMesh && dynMesh.userData.isSoftBody) {
        // For soft bodies, calculate average velocity
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
          const velocityMag = Math.sqrt(avgVx * avgVx + avgVz * avgVz);
          if (velocityMag > 0.5) {
            cameraRotation = Math.atan2(-avgVz, avgVx);
          }
        }
      } else {
        // For rigid bodies
        const lv = dynBody.getLinearVelocity();
        const velocityMag = Math.sqrt(lv.x() * lv.x() + lv.z() * lv.z());
        if (velocityMag > 0.5) {
          // Use velocity direction when moving (invert Z for correct orientation)
          cameraRotation = Math.atan2(-lv.z(), lv.x());
        }
        // If stationary, use null to fall back to OBB's e1
        A.destroy(lv);
      }
    }
    
    // Calculate velocity for line angle
    let velocity = null;
    if (dynBody && dynMesh) {
      if (dynMesh.userData.isSoftBody) {
        // For soft bodies, calculate average velocity
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
        }
      } else {
        // For rigid bodies
        const lv = dynBody.getLinearVelocity();
        velocity = { x: lv.x(), z: lv.z() };
        A.destroy(lv);
      }
    }

    // Calculate normal force for line intensity
    let normalForce = 20.0; // Default force
    if (dynBody && dynMesh) {
      // Calculate normal force based on mass, gravity, and vertical velocity
      let verticalVelocity = 0;
      if (dynMesh.userData.isSoftBody) {
        // For soft bodies, get average vertical velocity
        const nodes = dynBody.get_m_nodes();
        const nodeCount = nodes.size();
        for (let i = 0; i < nodeCount; i++) {
          const node = nodes.at(i);
          const nodeVel = node.get_m_v();
          verticalVelocity += nodeVel.y();
        }
        if (nodeCount > 0) verticalVelocity /= nodeCount;
      } else {
        // For rigid bodies
        const lv = dynBody.getLinearVelocity();
        verticalVelocity = lv.y();
        A.destroy(lv);
      }
      
      // Normal force = weight + impact force from vertical motion
      const weight = mass * gravity;
      const impactFactor = Math.max(0, -verticalVelocity * 2); // Negative velocity = downward
      normalForce = weight * (1.0 + impactFactor);
    }

    // Render all PiP views with velocity-based camera rotation
    pipManager.renderAll(
      pipEnabled,
      lastOBB,
      paddingWidthScale,
      paddingHeightScale,
      paddingDepthTopScale,
      paddingDepthBottomScale,
      null,
      cameraRotation,
      showPiP4,
      velocity,
      normalForce,
      lineIntensityScale
    );
    
    // Stamp intersection on ground
    if (enableStamping && now - lastStampTime >= stampInterval && lastOBB && contactSamples.length > 0) {
      lastStampTime = now;
      
      const intersectionCanvas = document.getElementById('pip3Canvas');
      if (intersectionCanvas) {
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
        
        if (hasContent) {
          // Calculate velocity for flow accumulation
          const velocity = { x: 0, z: 0 };
          let velocityMag = 0;
          let angularVelocityMag = 0;
          let currentVel = new THREE.Vector3(0, 0, 0);
          
          if (dynBody) {
            if (dynMesh && dynMesh.userData.isSoftBody) {
              // For soft bodies, calculate average velocity from nodes
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
                velocity.x = avgVx;
                velocity.z = avgVz;
                velocityMag = Math.sqrt(avgVx * avgVx + avgVz * avgVz);
                currentVel.set(avgVx, avgVy, avgVz);
              }
              
              // Soft bodies don't have angular velocity in the same way
              angularVelocityMag = 0;
            } else {
              // For rigid bodies, use standard methods
              const lv = dynBody.getLinearVelocity();
              velocity.x = lv.x();
              velocity.z = lv.z();
              velocityMag = Math.sqrt(velocity.x * velocity.x + velocity.z * velocity.z);
              currentVel.set(lv.x(), lv.y(), lv.z());
              A.destroy(lv);
              
              // Get angular velocity magnitude
              const av = dynBody.getAngularVelocity();
              angularVelocityMag = Math.sqrt(av.x() * av.x() + av.y() * av.y() + av.z() * av.z());
              A.destroy(av);
            }
          }
          
          // Choose stamp position: bounding box center or geometric center of contacts
          let stampWorldX, stampWorldZ;
          if (useBBoxCenter) {
            // Use actual 3D bounding box center (from mesh/body)
            if (dynMesh) {
              // Calculate 3D bounding box center from mesh
              const box = new THREE.Box3().setFromObject(dynMesh);
              const center = new THREE.Vector3();
              box.getCenter(center);
              stampWorldX = center.x;
              stampWorldZ = center.z;
            } else {
              // Fallback to OBB center if no mesh
              stampWorldX = lastOBB.center.x;
              stampWorldZ = lastOBB.center.z;
            }
          } else {
            // Use geometric center of contact points (default)
            stampWorldX = contactResult.geometricCenter.x;
            stampWorldZ = contactResult.geometricCenter.z;
          }
          
          // Convert to canvas coordinates (top-down view)
          const canvasX = ((stampWorldX + CFG.PLANE_SIZE / 2) / CFG.PLANE_SIZE) * stampCanvas.width;
          const canvasY = ((stampWorldZ + CFG.PLANE_SIZE / 2) / CFG.PLANE_SIZE) * stampCanvas.height;
          
          // Calculate stamp size using fixed padding
          const paddedWidth = lastOBB.width * paddingWidthScale;
          const paddedHeight = lastOBB.height * paddingHeightScale;
          const stampSize = Math.max(paddedWidth, paddedHeight) / CFG.PLANE_SIZE * stampCanvas.width;
          
          // Apply stamp (no rotation needed - intersection stencil is already rotated)
          stampCtx.save();
          stampCtx.translate(canvasX, canvasY);
          stampCtx.scale(1, -1); // Flip vertically (inverse UV)
          stampCtx.globalAlpha = 1.0;
          stampCtx.globalCompositeOperation = 'source-over';
          
          // Draw either line stencil or complete intersection based on checkbox
          if (stampLineStencil && pipManager && pipManager.pip4) {
            // Force update the stencil with current parameters, velocity, and normal force before stamping
            pipManager.pip4.forceUpdate(velocity, normalForce, lineIntensityScale);
            
            // Use line stencil from PiP4
            const lineStencilCanvas = pipManager.pip4.getStencilCanvas();
            if (lineStencilCanvas) {
              stampCtx.drawImage(
                lineStencilCanvas,
                -stampSize / 2,
                -stampSize / 2,
                stampSize,
                stampSize
              );
            }
          } else {
            // Use complete intersection (original behavior)
            stampCtx.drawImage(
              intersectionCanvas,
              -stampSize / 2,
              -stampSize / 2,
              stampSize,
              stampSize
            );
          }
          
          stampCtx.restore();
          stampTexture.needsUpdate = true;
          
          
          // Accumulate field intensity with normal force
          if (enableField) {
            // Calculate normal force: F = mass × gravity (+ vertical acceleration component)
            let verticalVelocity = 0;
            if (dynBody) {
              if (dynMesh && dynMesh.userData.isSoftBody) {
                // For soft bodies, get average vertical velocity
                verticalVelocity = currentVel.y;
              } else {
                // For rigid bodies
                const lv = dynBody.getLinearVelocity();
                verticalVelocity = lv.y();
                A.destroy(lv);
              }
            }
            
            // Normal force = weight + impact force from vertical motion
            const weight = mass * gravity;
            const impactFactor = Math.max(0, -verticalVelocity * 2); // Negative velocity = downward
            const normalForce = weight * (1.0 + impactFactor);
            
            // Update UI display
            const normalForceEl = document.getElementById('normalForce');
            if (normalForceEl) {
              normalForceEl.textContent = normalForce.toFixed(1) + ' N';
            }
            
            accumulateField(stampWorldX, stampWorldZ, normalForce, 10);
            renderField();
          }
          
          // Accumulate flow direction
          if (enableFlow && velocityMag > 0.01) {
            accumulateFlow(stampWorldX, stampWorldZ, velocity.x, velocity.z, 20);
            renderFlow();
          }
          
          // Render combined if enabled
          if (enableCombined) {
            renderCombined();
          }
        } // End hasContent
      } // End intersectionCanvas
    } // End enableStamping
}

// Collapsible sections functionality
function initCollapsibleSections() {
  const collapsibles = document.querySelectorAll('.collapsible');
  collapsibles.forEach(collapsible => {
    collapsible.addEventListener('click', () => {
      collapsible.classList.toggle('collapsed');
    });
  });
  
  // Set all sections to be closed by default
  const defaultClosedSections = [
    'statsDetails',
    'simulationControlsDetails',
    'wallStampingDetails',
    'physicsSimulationDetails',
    'bodyConfigDetails',
    'visualizationDetails',
    'groundStampingDetails',
    'lineStencilDetails',
    'fieldIntensityDetails',
    'flowMapDetails',
    'combinedDetails',
    'exportDetails'
  ];
  
  defaultClosedSections.forEach(sectionId => {
    const section = document.getElementById(sectionId);
    if (section) {
      const collapsible = section.previousElementSibling;
      if (collapsible && collapsible.classList.contains('collapsible')) {
        collapsible.classList.add('collapsed');
      }
    }
  });
}

// Export functionality for PiP views
function exportCanvas(canvas, filename) {
  const link = document.createElement('a');
  link.download = filename;
  link.href = canvas.toDataURL();
  link.click();
}

function exportPiP1() {
  const canvas = document.getElementById('pip1Canvas');
  exportCanvas(canvas, 'pip1_top_view.png');
}

function exportPiP2() {
  const canvas = document.getElementById('pip2Canvas');
  exportCanvas(canvas, 'pip2_bottom_view.png');
}

function exportPiP3() {
  const canvas = document.getElementById('pip3Canvas');
  exportCanvas(canvas, 'pip3_intersection.png');
}

function exportPiP4() {
  const canvas = document.getElementById('pip4Canvas');
  exportCanvas(canvas, 'pip4_line_stencil.png');
}

function exportAllPiPViews() {
  setTimeout(() => exportPiP1(), 100);
  setTimeout(() => exportPiP2(), 200);
  setTimeout(() => exportPiP3(), 300);
  setTimeout(() => exportPiP4(), 400);
}

// Initialize UI functionality
initCollapsibleSections();

// Add export event listeners
document.getElementById('exportPiP1').addEventListener('click', exportPiP1);
document.getElementById('exportPiP2').addEventListener('click', exportPiP2);
document.getElementById('exportPiP3').addEventListener('click', exportPiP3);
document.getElementById('exportPiP4').addEventListener('click', exportPiP4);
document.getElementById('saveIntersection').addEventListener('click', exportAllPiPViews);

// Start simulation
bodyManager.start();
animate();
