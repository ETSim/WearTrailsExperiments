// Contact Sampling and Geometric Center Calculation
// Robust acquisition with noise control, hysteresis, and quality gates

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
    this.alphaCentroid = overrides.alphaCentroid ?? 0.85;  // EMA factor
    this.N_hold = overrides.N_hold ?? 2;            // Hold-last frames

    // Performance limits
    this.N_target = overrides.N_target ?? 48;       // Target sample count
    this.maxManifolds = overrides.maxManifolds ?? 32; // Max manifolds to scan

    // Ground plane (default: y=0 horizontal)
    this.groundNormal = overrides.groundNormal ?? {x: 0, y: 1, z: 0};
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
  }

  reset() {
    this.prevSD = null;
    this.prevC = null;
    this.prevPts = null;
    this.prevFlags = null;
    this.holdFrames = 0;
  }
}

export function getMeshConvexHullOnPlane(mesh, planeY, THREE) {
  if (!mesh || !mesh.geometry) return [];
  
  // Project mesh vertices onto the XZ plane at given Y height
  const pos = mesh.geometry.attributes.position;
  const matrixWorld = mesh.matrixWorld;
  const points2D = [];
  const tempVec = new THREE.Vector3();
  
  for (let i = 0; i < pos.count; i++) {
    tempVec.set(pos.getX(i), pos.getY(i), pos.getZ(i));
    tempVec.applyMatrix4(matrixWorld);
    
    // Only consider vertices near the contact plane (within 0.5 units)
    if (Math.abs(tempVec.y - planeY) < 0.5) {
      points2D.push({ x: tempVec.x, z: tempVec.z });
    }
  }
  
  if (points2D.length < 3) return [];
  
  // Compute 2D convex hull using Graham scan
  const sorted = [...points2D].sort((a, b) => a.x === b.x ? a.z - b.z : a.x - b.x);
  const cross = (o, a, b) => (a.x - o.x) * (b.z - o.z) - (a.z - o.z) * (b.x - o.x);
  
  const lower = [];
  for (const p of sorted) {
    while (lower.length >= 2 && cross(lower[lower.length-2], lower[lower.length-1], p) <= 0) {
      lower.pop();
    }
    lower.push(p);
  }
  
  const upper = [];
  for (let i = sorted.length - 1; i >= 0; i--) {
    const p = sorted[i];
    while (upper.length >= 2 && cross(upper[upper.length-2], upper[upper.length-1], p) <= 0) {
      upper.pop();
    }
    upper.push(p);
  }
  
  return lower.slice(0, -1).concat(upper.slice(0, -1));
}

export function augmentContactsWithHull(contacts, mesh, planeY, gc, THREE) {
  let augmented = [...contacts];
  
  // Get convex hull of mesh projected onto contact plane
  const hull = getMeshConvexHullOnPlane(mesh, planeY, THREE);
  
  if (hull.length >= 3) {
    // Sample points along hull perimeter
    const samplesPerEdge = 2;
    for (let i = 0; i < hull.length; i++) {
      const p1 = hull[i];
      const p2 = hull[(i + 1) % hull.length];
      
      for (let j = 0; j <= samplesPerEdge; j++) {
        const t = j / samplesPerEdge;
        augmented.push({
          x: p1.x * (1 - t) + p2.x * t,
          y: planeY,
          z: p1.z * (1 - t) + p2.z * t
        });
      }
    }
  }
  
  // Also add geometric center ring for stability
  const ringRadius = 0.12;
  const ringCount = 6;
  for (let i = 0; i < ringCount; i++) {
    const angle = (Math.PI * 2 * i) / ringCount;
    augmented.push({
      x: gc.x + Math.cos(angle) * ringRadius,
      y: planeY,
      z: gc.z + Math.sin(angle) * ringRadius
    });
  }
  
  return augmented;
}

export function sampleContacts(dispatcher, THREE, dynMesh, MIN_CONTACTS_FOR_STABLE_BOX, softGroundThreshold = 0.15, params = null, state = null) {
  // Check if this is a soft body
  const isSoftBody = dynMesh && dynMesh.userData.isSoftBody;

  // Use provided params or create appropriate defaults based on body type
  if (!params) {
    params = isSoftBody ? ContactParams.forSoftBody() : new ContactParams();
  }
  if (!state) state = new ContactState();

  // Set ground offset from softGroundThreshold if not explicitly set
  const groundOffset = params.groundOffset ?? softGroundThreshold;
  const n = params.groundNormal;

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

    console.log(`[Soft Body] Checking ${manifolds} total manifolds (max ${maxManifolds})`);

    for (let i = 0; i < maxManifolds; i++) {
      const m = dispatcher.getManifoldByIndexInternal(i);
      const body0 = m.getBody0();
      const body1 = m.getBody1();

      // Check if this manifold involves our soft body
      const involvesOurSoftBody = (body0 === softBody || body1 === softBody);

      if (involvesOurSoftBody) {
        const numContacts = m.getNumContacts();
        console.log(`[Soft Body] Manifold ${i} has ${numContacts} contacts with our soft body`);

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
          } else {
            console.log(`[Soft Body] Rejected contact due to distance: ${distance.toFixed(4)} > ${params.d_max}`);
          }
        }
      }
    }

    console.log(`[Soft Body] Found ${manifoldContactsFound} contacts from manifolds`);

    // SECOND: Also check node signed distances for additional contact points
    const nodes = softBody.get_m_nodes();
    const nodeCount = nodes.size();
    let nodeContactsFound = 0;

    console.log(`[Soft Body] Checking ${nodeCount} nodes with signed distance threshold ${params.d_enter.toFixed(4)}`);

    // Initialize prevSD array if first run
    if (!state.prevSD) state.prevSD = new Array(nodeCount).fill(1e9);

    for (let i = 0; i < nodeCount && candidates.length < params.N_target; i++) {
      const node = nodes.at(i);
      const nodePos = node.get_m_x();
      const nodeNormal = node.get_m_n();

      const pi = { x: nodePos.x(), y: nodePos.y(), z: nodePos.z() };

      // Signed distance to ground plane
      const sd = (pi.x * n.x + pi.y * n.y + pi.z * n.z) - groundOffset;

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
        candidates.push(pi);

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

    console.log(`[Soft Body] Found ${nodeContactsFound} contacts from signed distance`);
    console.log(`[Soft Body] Total raw candidates: ${candidates.length}`);
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

  if (isSoftBody) {
    console.log(`[Soft Body] Before filtering: ${beforeFiltering} candidates`);
  }

  // Filter 1: XZ Grid Deduplication (optional)
  if (params.enableGridDedupe && filtered.length > 0) {
    const seen = new Set();
    const dedup = [];
    const gridInv = 1 / params.gridCellXZ;

    for (const pt of filtered) {
      const gx = (pt.x * gridInv) | 0;
      const gz = (pt.z * gridInv) | 0;
      const key = (gx << 16) ^ (gz & 0xffff);

      if (!seen.has(key)) {
        seen.add(key);
        dedup.push(pt);
      }
    }

    if (isSoftBody) {
      console.log(`[Soft Body] Grid dedupe: ${filtered.length} → ${dedup.length} (removed ${filtered.length - dedup.length})`);
    }
    filtered = dedup;
  }

  // Filter 2: Height Outlier Rejection (IQR) (optional)
  if (params.enableIQROutlier && filtered.length > 4) {
    const beforeIQR = filtered.length;
    const ys = filtered.map(p => p.y).sort((a, b) => a - b);
    const q25 = ys[Math.floor(ys.length * 0.25)];
    const q75 = ys[Math.floor(ys.length * 0.75)];
    const iqr = Math.max(1e-6, q75 - q25);
    const yMin = q25 - 1.5 * iqr;
    const yMax = q75 + 1.5 * iqr;

    filtered = filtered.filter(p => p.y >= yMin && p.y <= yMax);

    if (isSoftBody) {
      console.log(`[Soft Body] IQR outlier rejection: ${beforeIQR} → ${filtered.length} (removed ${beforeIQR - filtered.length})`);
    }
  }

  // Filter 3: Neighbor Support (only when explicitly enabled for soft bodies)
  // Note: This is disabled by default for soft bodies in ContactParams.forSoftBody()
  if (params.enableNeighborSupport && isSoftBody && filtered.length > params.k) {
    const beforeNeighbor = filtered.length;
    const kept = [];
    const r2 = params.r_n ** 2;

    for (const a of filtered) {
      let kCnt = 0;
      for (const b of filtered) {
        if (a === b) continue;
        const dx = a.x - b.x;
        const dz = a.z - b.z;
        if (dx * dx + dz * dz <= r2) kCnt++;
        if (kCnt >= params.k) break;
      }
      if (kCnt >= params.k) kept.push(a);
    }

    // Only apply filter if we still have enough contacts after filtering
    if (kept.length >= params.k) {
      if (isSoftBody) {
        console.log(`[Soft Body] Neighbor support: ${beforeNeighbor} → ${kept.length} (removed ${beforeNeighbor - kept.length})`);
      }
      filtered = kept;
    }
  }

  if (isSoftBody) {
    console.log(`[Soft Body] After all filtering: ${filtered.length} contacts`);
  }

  // ===== PHASE 3: CENTROID & NORMAL =====
  let avgContactNormal = new THREE.Vector3(0, 1, 0);
  let avgContactPoint = new THREE.Vector3(0, 0, 0);
  let geometricCenter = null;

  if (rawCount > 0) {
    nAccum.multiplyScalar(1 / Math.max(1, rawCount));
    if (nAccum.y < 0) nAccum.multiplyScalar(-1);
    avgContactNormal.copy(nAccum.lengthSq() > 1e-12 ? nAccum.normalize() : new THREE.Vector3(0, 1, 0));
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

    // Temporal EMA smoothing (optional)
    if (params.enableEMASmoothing && state.prevC) {
      const a = params.alphaCentroid;
      geometricCenter = {
        x: a * state.prevC.x + (1 - a) * geometricCenter.x,
        y: a * state.prevC.y + (1 - a) * geometricCenter.y,
        z: a * state.prevC.z + (1 - a) * geometricCenter.z
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
    if (filtered.length > 1) {
      const ys = filtered.map(p => p.y);
      const yMean = ys.reduce((a, b) => a + b, 0) / ys.length;
      const yVar = ys.reduce((a, b) => a + (b - yMean) ** 2, 0) / ys.length;
      const yStd = Math.sqrt(yVar);

      if (yStd > params.y_max) {
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
  let finalContacts = filtered;
  if (filtered.length <= MIN_CONTACTS_FOR_STABLE_BOX && dynMesh && geometricCenter) {
    const augmented = augmentContactsWithHull(
      filtered,
      dynMesh,
      avgContactPoint.y,
      geometricCenter,
      THREE
    );
    finalContacts = augmented;
  }

  // ===== RETURN RESULTS =====
  return {
    contactSamples: finalContacts,
    count: rawCount,
    filteredCount: filtered.length,
    rawCount: candidates.length,
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
      usedManifolds: isSoftBody || rawCount > 0,
      contactMethod: isSoftBody ? 'hybrid (manifold + signed distance)' : 'manifold only'
    }
  };
}
