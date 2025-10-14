// Physical Constants & Configuration
// All units explicitly documented to prevent drift

/**
 * Physics constants with explicit units
 */
export const PHYSICS_CONSTANTS = {
  // Units
  UNITS: 'meters',  // All spatial measurements in meters
  SCALE_METERS: 1.0, // Unit scale multiplier (1.0 = meters)

  // Contact sampling thresholds (in meters)
  D_ENTER_M: 0.004,   // 4mm - Enter threshold for hysteresis
  D_EXIT_M: 0.010,    // 10mm - Exit threshold for hysteresis
  D_MAX_M: 0.005,     // 5mm - Max separation for rigid contacts

  // Spatial filtering (in meters)
  GRID_CELL_XZ_M: 0.004,  // 4mm - Grid cell size for deduplication
  MIN_PAIR_DIST_M: 0.002,  // 2mm - Minimum pairwise distance
  Y_MAX_M: 0.008,          // 8mm - Max vertical spread

  // Neighbor support (in meters)
  R_NEIGHBOR_M: 0.015,  // 15mm - Neighbor radius for soft bodies
  K_MIN_NEIGHBORS: 2,   // Minimum neighbors required

  // Angle thresholds (in radians)
  ANGLE_JUMP_RAD: 0.436332,  // 25° in radians - Max angle jump for continuity
  ANGLE_EPSILON: 1e-9,       // Epsilon for angle comparisons

  // Material properties
  STEEL_HARDNESS_PA: 1e9,    // 1 GPa - Steel hardness in Pascals
  DEFAULT_DENSITY_KG_M2: 1.0, // 1 kg/m² - Surface density
  DEFAULT_FRICTION: 0.5,      // Dimensionless - Default friction coefficient

  // Wear model coefficients (dimensionless)
  K_WEAR_ENERGY: 0.001,  // Energy wear coefficient (Archard model)
  K_WEAR_SIMPLE: 0.15,   // Simple wear coefficient

  // Numerical stability
  EPSILON: 1e-9,         // General epsilon for float comparisons
  MIN_LENGTH_SQ: 1e-12,  // Minimum squared length before normalization

  // Kahan summation threshold
  KAHAN_THRESHOLD: 100,  // Use Kahan summation for n > threshold
};

/**
 * Angle utilities with proper wrapping
 */
export function wrapToPi(angle) {
  // Wrap angle to [-π, π]
  while (angle > Math.PI) angle -= 2 * Math.PI;
  while (angle < -Math.PI) angle += 2 * Math.PI;
  return angle;
}

export function angleDifference(a, b) {
  // Shortest angle difference between a and b
  return wrapToPi(a - b);
}

export function isAngleJump(prevAngle, newAngle, threshold = PHYSICS_CONSTANTS.ANGLE_JUMP_RAD) {
  // Check if angle jump exceeds threshold
  return Math.abs(angleDifference(newAngle, prevAngle)) > threshold;
}

/**
 * Unit vector blending for directions (prevents angle discontinuities)
 */
export function blendDirections(dir1, dir2, weight) {
  // Blend two direction vectors (must be normalized)
  // weight: 0 = all dir1, 1 = all dir2
  const x = dir1.x * (1 - weight) + dir2.x * weight;
  const z = dir1.z * (1 - weight) + dir2.z * weight;

  // Normalize result
  const mag = Math.sqrt(x * x + z * z);
  if (mag < PHYSICS_CONSTANTS.EPSILON) {
    return { x: 1, z: 0 }; // Default to +X
  }

  return { x: x / mag, z: z / mag };
}

/**
 * Convert direction vector to hue (0-1 range)
 */
export function directionToHue(dirX, dirZ) {
  const angle = Math.atan2(dirZ, dirX);
  return (angle + Math.PI) / (2 * Math.PI); // Map [-π, π] to [0, 1]
}

/**
 * Kahan summation for high-precision centroid calculation
 */
export class KahanSum {
  constructor() {
    this.sum = 0;
    this.compensation = 0;
  }

  add(value) {
    const y = value - this.compensation;
    const t = this.sum + y;
    this.compensation = (t - this.sum) - y;
    this.sum = t;
  }

  get value() {
    return this.sum;
  }
}

/**
 * Compute centroid with optional Kahan summation for large point sets
 */
export function computeCentroid(points, useKahan = false) {
  if (points.length === 0) {
    return { x: 0, y: 0, z: 0 };
  }

  if (!useKahan || points.length < PHYSICS_CONSTANTS.KAHAN_THRESHOLD) {
    // Simple summation for small sets
    let sumX = 0, sumY = 0, sumZ = 0;
    for (const p of points) {
      sumX += p.x;
      sumY += p.y;
      sumZ += p.z;
    }
    const n = points.length;
    return { x: sumX / n, y: sumY / n, z: sumZ / n };
  }

  // Kahan summation for large sets
  const kahanX = new KahanSum();
  const kahanY = new KahanSum();
  const kahanZ = new KahanSum();

  for (const p of points) {
    kahanX.add(p.x);
    kahanY.add(p.y);
    kahanZ.add(p.z);
  }

  const n = points.length;
  return {
    x: kahanX.value / n,
    y: kahanY.value / n,
    z: kahanZ.value / n
  };
}

/**
 * Safe normalize with NaN check
 */
export function safeNormalize(x, y, z = 0) {
  const lenSq = x * x + y * y + z * z;

  if (lenSq < PHYSICS_CONSTANTS.MIN_LENGTH_SQ) {
    // Vector too small, return default
    return { x: 1, y: 0, z: 0 };
  }

  const len = Math.sqrt(lenSq);

  // NaN check
  if (!isFinite(len) || len === 0) {
    return { x: 1, y: 0, z: 0 };
  }

  return { x: x / len, y: y / len, z: z / len };
}
