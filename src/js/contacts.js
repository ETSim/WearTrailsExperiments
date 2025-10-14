
import { Plane } from './math/plane.js?v=2.1';

// Contact Sampling and Geometric Center Calculation
// Robust acquisition with noise control, hysteresis, and quality gates

// ===== Spatial Grid for O(n) Neighbor Queries =====
class SpatialGrid {
  constructor(cellSize) {
    this.cellSize = cellSize;
    this.cells = new Map();  // key: "gx,gz" → value: array of points
  }

  clear() {
    this.cells.clear();
  }

  insert(point) {
    const key = this._getKey(point.x, point.z);
    if (!this.cells.has(key)) {
      this.cells.set(key, []);
    }
    this.cells.get(key).push(point);
  }

  queryNeighbors(point, radius) {
    // 9-cell neighborhood check (current cell + 8 surrounding cells)
    const radiusSq = radius * radius;
    const neighbors = [];

    const cellX = Math.floor(point.x / this.cellSize);
    const cellZ = Math.floor(point.z / this.cellSize);

    // Check 3x3 grid of cells
    for (let dx = -1; dx <= 1; dx++) {
      for (let dz = -1; dz <= 1; dz++) {
        const key = `${cellX + dx},${cellZ + dz}`;
        const cellPoints = this.cells.get(key);

        if (cellPoints) {
          for (const candidate of cellPoints) {
            if (candidate === point) continue; // Skip self

            const distSq = (point.x - candidate.x) ** 2 + (point.z - candidate.z) ** 2;
            if (distSq <= radiusSq) {
              neighbors.push(candidate);
            }
          }
        }
      }
    }

    return neighbors;
  }

  _getKey(x, z) {
    const gx = Math.floor(x / this.cellSize);
    const gz = Math.floor(z / this.cellSize);
    return `${gx},${gz}`;
  }
}

// ===== Contact Parameters Class =====
export class ContactParams {
  constructor(overrides = {}) {
    // Threshold parameters
    this.d_enter = overrides.d_enter ?? 0.004;      // Enter threshold (4mm)
    this.d_exit = overrides.d_exit ?? 0.010;        // Exit threshold (10mm)
    this.d_max = overrides.d_max ?? 0.005;          // Max separation for rigid (5mm)

    // Spatial filtering
    this.gridCellXZ = overrides.gridCellXZ ?? 0.004;  // Grid cell size (4mm)
    this.minPairDist = overrides.minPairDist ?? 0.002; // Min pairwise distance (2mm)
    this.y_max = overrides.y_max ?? 0.008;          // Max vertical spread (8mm)

    // Velocity gating
    this.v_min = overrides.v_min ?? 0.02;           // Min downward velocity (m/s)
    this.v_ref = overrides.v_ref ?? 0.3;            // Reference velocity for weighting

    // Neighbor support (soft body)
    this.r_n = overrides.r_n ?? 0.015;              // Neighbor radius (15mm)
    this.k = overrides.k ?? 2;                      // Min neighbors required

    // Temporal smoothing
    this.tauCentroid = overrides.tauCentroid ?? 0.05;  // EMA time constant in seconds (50ms)
    this.N_hold = overrides.N_hold ?? 2;            // Hold-last frames

    // Performance limits
    this.N_target = overrides.N_target ?? 48;       // Target sample count
    this.maxManifolds = overrides.maxManifolds ?? 32; // Max manifolds to scan

    // Ground plane (default: y=0 horizontal) - ensure normalized
    const gn = overrides.groundNormal ?? {x: 0, y: 1, z: 0};
    const gnMag = Math.sqrt(gn.x * gn.x + gn.y * gn.y + gn.z * gn.z);
    this.groundNormal = gnMag > 1e-9 ? {x: gn.x/gnMag, y: gn.y/gnMag, z: gn.z/gnMag} : {x: 0, y: 1, z: 0};
    this.groundOffset = overrides.groundOffset ?? null; // null = use softGroundThreshold

    // Filter enable flags (all true by default for production)
    this.enableHysteresis = overrides.enableHysteresis ?? true;
    this.enableVelocityGate = overrides.enableVelocityGate ?? true;
    this.enableDistanceFilter = overrides.enableDistanceFilter ?? true;
    this.enableGridDedupe = overrides.enableGridDedupe ?? true;
    this.enableIQROutlier = overrides.enableIQROutlier ?? true;
    this.enableNeighborSupport = overrides.enableNeighborSupport ?? true;
    this.enableEMASmoothing = overrides.enableEMASmoothing ?? true;
    this.enableHoldLast = overrides.enableHoldLast ?? true;
    this.enableQualityGates = overrides.enableQualityGates ?? true;
  }

  // Preset for soft body physics (very lenient thresholds to capture all contacts)
  static forSoftBody() {
    return new ContactParams({
      d_enter: 0.050,            // 50mm - very lenient for soft body deformation
      d_exit: 0.080,             // 80mm - much wider hysteresis band
      d_max: 0.100,              // 100mm max separation for manifold contacts
      r_n: 0.050,                // 50mm neighbor radius (very wide for deformed surfaces)
      k: 1,                      // Only 1 neighbor required (soft bodies deform)
      y_max: 0.100,              // 100mm vertical spread (soft bodies compress significantly)
      v_min: 0.005,              // Very low velocity threshold (5mm/s)
      gridCellXZ: 0.010,         // Larger grid cells to avoid over-deduplication
      minPairDist: 0.001,        // Very small minimum distance
      N_target: 128,             // Allow more contact samples
      maxManifolds: 64,          // Check more manifolds
      enableNeighborSupport: false,  // Disable - too aggressive for soft bodies
      enableVelocityGate: false,     // Disable - not reliable for soft bodies
      enableHysteresis: false,       // Disable - can block initial contacts
      enableGridDedupe: false,       // DISABLE - was removing too many contacts
      enableIQROutlier: false,       // DISABLE - too aggressive for soft bodies
      enableEMASmoothing: true,      // Keep smoothing for stability
      enableHoldLast: true,          // Keep hold-last for stability
      enableQualityGates: false,     // DISABLE - too restrictive for soft bodies
      enableDistanceFilter: false    // DISABLE - accept all manifold contacts
    });
  }
}

// ===== Contact State Class (temporal memory) =====
export class ContactState {
  constructor() {
    this.prevSD = null;          // Previous signed distances per node
    this.prevC = null;           // Previous centroid
    this.prevPts = null;         // Previous points (for hold-last)
    this.prevFlags = null;       // Previous flags
    this.holdFrames = 0;         // Hold-last counter
    this.prevDt = null;          // Previous delta time for frame-rate independent EMA
    this.lastUpdateTime = null;  // Last update timestamp
  }

  reset() {
    this.prevSD = null;
    this.prevC = null;
    this.prevPts = null;
    this.prevFlags = null;
    this.holdFrames = 0;
    this.prevDt = null;
    this.lastUpdateTime = null;
  }
}

export function getMeshKDOP8OnPlane(mesh, plane, THREE, tolerance = 0.15) {
  if (!mesh || !mesh.geometry) return null;
  if (!plane || typeof plane.getLocalFrame !== 'function') {
    console.warn('Plane object invalid or missing getLocalFrame method');
    return null;
  }

  const pos = mesh.geometry.attributes.position;
  const matrixWorld = mesh.matrixWorld;
  const points2D = [];
  const tempVec = new THREE.Vector3();
  const localFrame = plane.getLocalFrame();

  // Performance optimization: Limit vertex sampling for large meshes
  const MAX_VERTICES_TO_SAMPLE = 500; // Limit to first 500 vertices
  const totalVertices = pos.count;
  const shouldSample = totalVertices > MAX_VERTICES_TO_SAMPLE;
  const sampleStep = shouldSample ? Math.ceil(totalVertices / MAX_VERTICES_TO_SAMPLE) : 1;

  for (let i = 0; i < pos.count; i += sampleStep) {
    tempVec.set(pos.getX(i), pos.getY(i), pos.getZ(i));
    tempVec.applyMatrix4(matrixWorld);

    if (Math.abs(plane.signedDistanceToPoint(tempVec)) < tolerance) {
      const projected = plane.projectPoint(tempVec, new THREE.Vector3());
      const u = projected.dot(localFrame.tangent);
      const v = projected.dot(localFrame.bitangent);
      points2D.push({ x: u, z: v });
    }
  }

  if (points2D.length < 3) return null;

  const uniquePoints = [];
  const seen = new Set();
  const gridSize = 0.01;

  for (const pt of points2D) {
    const gridX = Math.round(pt.x / gridSize);
    const gridZ = Math.round(pt.z / gridSize);
    const key = `${gridX},${gridZ}`;

    if (!seen.has(key)) {
      seen.add(key);
      uniquePoints.push(pt);
    }
  }

  if (uniquePoints.length < 3) return null;

  let bestArea = Infinity;
  let bestBox = null;

  for (let i = 0; i < 8; i++) {
    const theta = Math.PI * i / 8;
    const cosT = Math.cos(theta);
    const sinT = Math.sin(theta);

    let minU = Infinity, maxU = -Infinity;
    let minV = Infinity, maxV = -Infinity;

    for (const pt of uniquePoints) {
      const u = pt.x * cosT + pt.z * sinT;
      const v = -pt.x * sinT + pt.z * cosT;
      minU = Math.min(minU, u);
      maxU = Math.max(maxU, u);
      minV = Math.min(minV, v);
      maxV = Math.max(maxV, v);
    }

    const width = maxU - minU;
    const height = maxV - minV;
    const area = width * height;

    if (area < bestArea) {
      bestArea = area;
      bestBox = {
        theta: theta,
        centerU: (minU + maxU) / 2,
        centerV: (minV + maxV) / 2,
        halfWidth: width / 2,
        halfHeight: height / 2
      };
    }
  }

  if (!bestBox) return null;

  const { theta, centerU, centerV, halfWidth, halfHeight } = bestBox;

  const corners = [
    { u: centerU - halfWidth, v: centerV - halfHeight },
    { u: centerU + halfWidth, v: centerV - halfHeight },
    { u: centerU + halfWidth, v: centerV + halfHeight },
    { u: centerU - halfWidth, v: centerV + halfHeight }
  ];

  const tangent = localFrame.tangent;
  const bitangent = localFrame.bitangent;
  const p0 = plane.p0;

  return corners.map(c => {
    const pointOnPlane = new THREE.Vector3().copy(p0)
        .addScaledVector(tangent, c.u)
        .addScaledVector(bitangent, c.v);
    return { x: pointOnPlane.x, y: pointOnPlane.y, z: pointOnPlane.z };
  });
}

export function augmentContactsWithKDOP8(contacts, mesh, plane, gc, THREE, angularVelocity = null) {
  // ONLY augment if there are actual contacts to work with
  if (contacts.length === 0) {
    return [];
  }

  // Copy existing contacts and mark as real (not synthetic)
  let augmented = contacts.map(pt => ({
    x: pt.x,
    y: pt.y,
    z: pt.z,
    isSynthetic: false
  }));

  const tolerance = 0.10; // 10cm tolerance for mesh projection

  // Get KDOP-8 bounding box corners (4 points, much simpler than convex hull)
  const corners = getMeshKDOP8OnPlane(mesh, plane, THREE, tolerance);

  // Calculate rotation speed if angular velocity provided
  let rotationSpeed = 0;
  if (angularVelocity) {
    rotationSpeed = Math.sqrt(
      angularVelocity.x ** 2 + 
      angularVelocity.y ** 2 + 
      angularVelocity.z ** 2
    );
  }

  // High rotation threshold: > 5 rad/s
  const isHighRotation = rotationSpeed > 5.0;

  if (corners && corners.length === 4) {
    // Add all 4 corners as synthetic points
    for (const corner of corners) {
      augmented.push({
        x: corner.x,
        y: corner.y,
        z: corner.z,
        isSynthetic: true
      });
    }

    // For high rotation: add midpoint synthetics between corners for better coverage
    if (isHighRotation) {
      for (let i = 0; i < 4; i++) {
        const c1 = corners[i];
        const c2 = corners[(i + 1) % 4];
        
        augmented.push({
          x: (c1.x + c2.x) / 2,
          y: (c1.y + c2.y) / 2,
          z: (c1.z + c2.z) / 2,
          isSynthetic: true
        });
      }
      console.log(`High rotation detected (${rotationSpeed.toFixed(2)} rad/s) - added ${4} midpoint synthetic contacts`);
    }
  }

  return augmented;
}

// ===== Utility Functions for Contact Separation =====
export function getRealContacts(contactSamples) {
  return contactSamples.filter(pt => !pt.isSynthetic);
}

export function getSyntheticContacts(contactSamples) {
  return contactSamples.filter(pt => pt.isSynthetic);
}

export function separateContacts(contactSamples) {
  return {
    real: getRealContacts(contactSamples),
    synthetic: getSyntheticContacts(contactSamples),
    all: contactSamples
  };
}

export function sampleContacts(dispatcher, THREE, dynMesh, MIN_CONTACTS_FOR_STABLE_BOX, softGroundThreshold = 0.15, params = null, state = null) {
  // Check if this is a soft body
  const isSoftBody = dynMesh && dynMesh.userData.isSoftBody;

  // Use provided params or create appropriate defaults based on body type
  if (!params) {
    params = isSoftBody ? ContactParams.forSoftBody() : new ContactParams();
  }
  if (!state) state = new ContactState();

  // Calculate frame-rate independent dt
  const currentTime = performance.now() / 1000.0; // Convert to seconds
  if (state.lastUpdateTime !== null) {
    state.prevDt = currentTime - state.lastUpdateTime;
  } else {
    state.prevDt = 1.0 / 60.0; // Default 60 FPS
  }
  state.lastUpdateTime = currentTime;

  // Set ground offset from softGroundThreshold if not explicitly set
  const groundOffset = params.groundOffset ?? softGroundThreshold;
  const n = params.groundNormal;
  
  // Create plane for geometric operations
  let plane = null;
  try {
    plane = new Plane(new THREE.Vector3(n.x, n.y, n.z), new THREE.Vector3(0, groundOffset, 0));
    
    // Verify plane has required methods
    if (!plane.getLocalFrame || typeof plane.getLocalFrame !== 'function') {
      console.error('Plane class is outdated - missing getLocalFrame method. Please hard refresh (Ctrl+Shift+R)');
      plane = null;
    }
  } catch (error) {
    console.error('Failed to create Plane:', error);
    // Fallback: plane operations will be skipped
  }


  const candidates = [];  // Raw contact candidates
  const nAccum = new THREE.Vector3(0, 0, 0);
  const pAccum = new THREE.Vector3(0, 0, 0);
  let rawCount = 0;

  // ===== PHASE 1: ACQUIRE CANDIDATES =====
  if (isSoftBody && dynMesh.userData.physicsBody) {
    // SOFT BODY PATH: Use BOTH manifold contacts AND signed distance
    const softBody = dynMesh.userData.physicsBody;
    let manifoldContactsFound = 0;

    // FIRST: Check contact manifolds (soft body <-> rigid body contacts)
    const manifolds = dispatcher.getNumManifolds();
    const maxManifolds = Math.min(manifolds, params.maxManifolds);

    for (let i = 0; i < maxManifolds; i++) {
      const m = dispatcher.getManifoldByIndexInternal(i);
      const body0 = m.getBody0();
      const body1 = m.getBody1();

      // Check if this manifold involves our soft body
      const involvesOurSoftBody = (body0 === softBody || body1 === softBody);

      if (involvesOurSoftBody) {
        const numContacts = m.getNumContacts();

        for (let j = 0; j < numContacts && candidates.length < params.N_target; j++) {
          const p = m.getContactPoint(j);

          // For soft bodies, be very lenient with distance
          const distance = p.getDistance?.() ?? 0;
          const acceptContact = params.enableDistanceFilter ? (distance <= params.d_max) : true;

          if (acceptContact) {
            const nB = p.get_m_normalWorldOnB && p.get_m_normalWorldOnB();
            if (nB) {
              nAccum.x += nB.x();
              nAccum.y += nB.y();
              nAccum.z += nB.z();
            }

            const pwB = p.get_m_positionWorldOnB && p.get_m_positionWorldOnB();
            if (pwB) {
              const pi = { x: pwB.x(), y: pwB.y(), z: pwB.z() };
              candidates.push(pi);

              pAccum.x += pi.x;
              pAccum.y += pi.y;
              pAccum.z += pi.z;

              rawCount++;
              manifoldContactsFound++;
            }
          }
        }
      }
    }

    // SECOND: Also check node signed distances for additional contact points
    const nodes = softBody.get_m_nodes();
    const nodeCount = nodes.size();
    let nodeContactsFound = 0;

    // Initialize prevSD array if first run
    if (!state.prevSD) state.prevSD = new Array(nodeCount).fill(1e9);

    for (let i = 0; i < nodeCount && candidates.length < params.N_target; i++) {
      const node = nodes.at(i);
      const nodePos = node.get_m_x();
      const nodeNormal = node.get_m_n();

      const pi = new THREE.Vector3(nodePos.x(), nodePos.y(), nodePos.z() );

      // Signed distance to ground plane
      const sd = plane.signedDistanceToPoint(pi);

      // Determine if node should be kept
      let keepNode = false;

      // Base threshold check
      keepNode = (sd <= params.d_enter);

      // Hysteresis: check previous state (optional)
      if (params.enableHysteresis) {
        const sdPrev = state.prevSD[i];
        const entering = (sdPrev > params.d_exit) && (sd <= params.d_enter);
        keepNode = keepNode || entering;
      }

      // Velocity gate: downward motion component (optional)
      if (params.enableVelocityGate) {
        try {
          const nodeVel = node.get_m_v();
          if (nodeVel) {
            const vDot = nodeVel.x() * n.x + nodeVel.y() * n.y + nodeVel.z() * n.z;
            keepNode = keepNode || (vDot < -params.v_min);
          }
        } catch (e) {
          // Velocity method not available, skip velocity gating
        }
      }

      if (keepNode) {
        candidates.push({x: pi.x, y: pi.y, z: pi.z});

        // Accumulate position and normal
        pAccum.x += pi.x;
        pAccum.y += pi.y;
        pAccum.z += pi.z;

        nAccum.x += nodeNormal.x();
        nAccum.y += nodeNormal.y();
        nAccum.z += nodeNormal.z();

        rawCount++;
        nodeContactsFound++;
      }

      // Update state
      state.prevSD[i] = sd;
    }
  } else {
    // RIGID BODY PATH: Manifold scanning with distance filter
    const manifolds = dispatcher.getNumManifolds();
    const maxManifolds = Math.min(manifolds, params.maxManifolds);

    for (let i = 0; i < maxManifolds && candidates.length < params.N_target; i++) {
      const m = dispatcher.getManifoldByIndexInternal(i);
      const n = m.getNumContacts();

      for (let j = 0; j < n && candidates.length < params.N_target; j++) {
        const p = m.getContactPoint(j);

        // Distance filter: reject separated contacts (optional)
        if (params.enableDistanceFilter) {
          const distance = p.getDistance?.() ?? 0;
          if (distance > params.d_max) continue;
        }

        const nB = p.get_m_normalWorldOnB && p.get_m_normalWorldOnB();
        if (nB) {
          nAccum.x += nB.x();
          nAccum.y += nB.y();
          nAccum.z += nB.z();
        }

        const pwB = p.get_m_positionWorldOnB && p.get_m_positionWorldOnB();
        if (pwB) {
          const pi = { x: pwB.x(), y: pwB.y(), z: pwB.z() };
          candidates.push(pi);

          pAccum.x += pi.x;
          pAccum.y += pi.y;
          pAccum.z += pi.z;

          rawCount++;
        }
      }
    }
  }

  // ===== PHASE 2: NOISE CONTROL =====
  let filtered = candidates;
  const beforeFiltering = filtered.length;


  // Filter 1: XZ Grid Deduplication (optional)
  if (params.enableGridDedupe && filtered.length > 0) {
    const seen = new Set();
    const dedup = [];
    const gridInv = 1 / params.gridCellXZ;

    for (const pt of filtered) {
      const gx = Math.floor(pt.x * gridInv);
      const gz = Math.floor(pt.z * gridInv);
      const key = `${gx},${gz}`; // String key prevents hash collisions

      if (!seen.has(key)) {
        seen.add(key);
        dedup.push(pt);
      }
    }
    filtered = dedup;
  }

  // Filter 2: Height Outlier Rejection (IQR) (optional)
  // Only apply IQR when n >= 8 (quartiles well-defined)
  if (params.enableIQROutlier && filtered.length >= 8 && plane) {
    const beforeIQR = filtered.length;
    const distances = filtered.map(p => plane.signedDistanceToPoint(new THREE.Vector3(p.x, p.y, p.z))).sort((a, b) => a - b);
    const q25 = distances[Math.floor(distances.length * 0.25)];
    const q75 = distances[Math.floor(distances.length * 0.75)];
    const iqr = Math.max(1e-6, q75 - q25);
    const dMin = q25 - 1.5 * iqr;
    const dMax = q75 + 1.5 * iqr;

    filtered = filtered.filter(p => {
        const dist = plane.signedDistanceToPoint(new THREE.Vector3(p.x, p.y, p.z));
        return dist >= dMin && dist <= dMax;
    });
  }

  // Filter 3: Neighbor Support with Spatial Grid (O(n) instead of O(n²))
  // Note: This is disabled by default for soft bodies in ContactParams.forSoftBody()
  if (params.enableNeighborSupport && isSoftBody && filtered.length > params.k) {
    // Build spatial grid for O(n) neighbor queries
    const grid = new SpatialGrid(params.r_n);
    for (const pt of filtered) {
      grid.insert(pt);
    }

    // Check neighbor count using grid
    const kept = [];
    for (const pt of filtered) {
      const neighbors = grid.queryNeighbors(pt, params.r_n);
      if (neighbors.length >= params.k) {
        kept.push(pt);
      }
    }

    // Only apply filter if we still have enough contacts after filtering
    if (kept.length >= params.k) {
      filtered = kept;
    }
  }


  // ===== PHASE 3: CENTROID & NORMAL =====
  let avgContactNormal = new THREE.Vector3(0, 1, 0);
  let avgContactPoint = new THREE.Vector3(0, 0, 0);
  let geometricCenter = null;

  if (rawCount > 0) {
    nAccum.multiplyScalar(1 / Math.max(1, rawCount));
    const groundNormalVec = new THREE.Vector3(n.x, n.y, n.z);
    if (nAccum.dot(groundNormalVec) < 0) nAccum.multiplyScalar(-1);
    avgContactNormal.copy(nAccum.lengthSq() > 1e-12 ? nAccum.normalize() : groundNormalVec);
    pAccum.multiplyScalar(1 / Math.max(1, rawCount));
    avgContactPoint.copy(pAccum);
  }

  if (filtered.length > 0) {
    let sumx = 0, sumy = 0, sumz = 0;
    for (const p of filtered) {
      sumx += p.x;
      sumy += p.y;
      sumz += p.z;
    }
    geometricCenter = {
      x: sumx / filtered.length,
      y: sumy / filtered.length,
      z: sumz / filtered.length
    };

    // Temporal EMA smoothing (optional) - frame-rate independent
    if (params.enableEMASmoothing && state.prevC && state.prevDt) {
      // α = exp(-dt/τ) for frame-rate independence
      const alpha = Math.exp(-state.prevDt / params.tauCentroid);
      geometricCenter = {
        x: alpha * state.prevC.x + (1 - alpha) * geometricCenter.x,
        y: alpha * state.prevC.y + (1 - alpha) * geometricCenter.y,
        z: alpha * state.prevC.z + (1 - alpha) * geometricCenter.z
      };
    }
  }

  // ===== PHASE 4: QUALITY GATES =====
  const flags = { degraded: false, rejected: false, held: false, reasons: [] };

  if (params.enableQualityGates) {
    // Sparse contact gate
    if (filtered.length < 4) {
      flags.degraded = true;
      flags.reasons.push('sparse');
    }

    // Vertical spread gate
    if (filtered.length > 1 && plane) {
      const distances = filtered.map(p => plane.signedDistanceToPoint(new THREE.Vector3(p.x, p.y, p.z)));
      const dMean = distances.reduce((a, b) => a + b, 0) / distances.length;
      const dVar = distances.reduce((a, b) => a + (b - dMean) ** 2, 0) / distances.length;
      const dStd = Math.sqrt(dVar);

      if (dStd > params.y_max) {
        flags.rejected = true;
        flags.reasons.push('vertical_spread');
      }
    }

    // Complete rejection gate
    if (filtered.length === 0) {
      flags.rejected = true;
      flags.reasons.push('no_contacts');
    }
  }

  // Hold-last-good logic (optional)
  if (params.enableHoldLast) {
    if (flags.rejected && state.prevPts && state.prevC && state.holdFrames < params.N_hold) {
      filtered = state.prevPts;
      geometricCenter = state.prevC;
      flags.held = true;
      state.holdFrames++;
    } else {
      state.holdFrames = 0;
      state.prevPts = filtered;
      if (geometricCenter) state.prevC = geometricCenter;
    }
  } else {
    // Always update state even if hold-last is disabled
    state.holdFrames = 0;
    state.prevPts = filtered;
    if (geometricCenter) state.prevC = geometricCenter;
  }

  // ===== PHASE 5: AUGMENTATION (if still sparse) =====
  let finalContacts;
  let syntheticCount = 0;
  let hullVertexCount = 0;

  // Check if synthetic augmentation is enabled globally (check both state object and global variable)
  const enableSynthetic = (typeof window !== 'undefined') ?
    (window.state?.enableSynthetic !== false && window.enableSynthetic !== false) : true;

  // Only augment if: 1) synthetic enabled, 2) contacts exist, 3) they're sparse, 4) we have mesh and center
  if (enableSynthetic &&
      filtered.length > 0 &&
      filtered.length <= MIN_CONTACTS_FOR_STABLE_BOX &&
      dynMesh &&
      geometricCenter) {

    // Get angular velocity from physics body for high-rotation detection
    let angularVelocity = null;
    if (dynMesh && dynMesh.userData.physicsBody) {
      try {
        const av = dynMesh.userData.physicsBody.getAngularVelocity();
        angularVelocity = { x: av.x(), y: av.y(), z: av.z() };
        // Note: We don't destroy av here as it's managed by Ammo
      } catch (e) {
        // Failed to get angular velocity - not critical
      }
    }

    // Augment with synthetic KDOP-8 corner points (4-8 points depending on rotation)
    const augmented = augmentContactsWithKDOP8(
      filtered,
      dynMesh,
      plane,
      geometricCenter,
      THREE,
      angularVelocity  // Pass angular velocity for high-rotation detection
    );

    finalContacts = augmented;
    syntheticCount = augmented.filter(pt => pt.isSynthetic).length;
  } else if (filtered.length > 0) {
    // No augmentation needed or disabled - mark all as real contacts
    finalContacts = filtered.map(pt => ({
      x: pt.x,
      y: pt.y,
      z: pt.z,
      isSynthetic: false
    }));
  } else {
    // No contacts at all - return empty array
    finalContacts = [];
  }

  // ===== RETURN RESULTS =====
  const realContactCount = finalContacts.filter(pt => !pt.isSynthetic).length;

  return {
    contactSamples: finalContacts,
    count: rawCount,
    filteredCount: filtered.length,
    rawCount: candidates.length,
    realContactCount: realContactCount,
    syntheticCount: syntheticCount,
    avgContactNormal,
    avgContactPoint,
    geometricCenter: geometricCenter || { x: 0, y: 0, z: 0 },
    flags,
    diagnostics: {
      isSoftBody: isSoftBody,
      gridDeduped: candidates.length - filtered.length,
      augmented: finalContacts.length > filtered.length,
      candidateCount: candidates.length,
      filteredCount: filtered.length,
      finalCount: finalContacts.length,
      realContactCount: realContactCount,
      syntheticCount: syntheticCount,
      hullVertexCount: hullVertexCount,
      usedManifolds: isSoftBody || rawCount > 0,
      contactMethod: isSoftBody ? 'hybrid (manifold + signed distance)' : 'manifold only',
      augmentationUsed: syntheticCount > 0 ? 'hull-based' : 'none'
    }
  };
}
