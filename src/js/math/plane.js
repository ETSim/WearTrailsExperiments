// Plane class for geometric operations
// Represents a plane in 3D space defined by a normal vector and a point
// Version: 2.1 - Cache-busting update

export class Plane {
  /**
   * Create a plane from a normal vector and a point on the plane
   * @param {THREE.Vector3} normal - Normal vector (will be normalized)
   * @param {THREE.Vector3} point - A point on the plane (p0)
   */
  constructor(normal, point) {
    // Normalize the normal vector
    this.normal = normal.clone().normalize();
    
    // Store point on plane
    this.p0 = point.clone();
    
    // Calculate offset: d = p0 · n
    this.offset = this.p0.dot(this.normal);
  }

  /**
   * Calculate signed distance from a point to the plane
   * Positive = above plane (in direction of normal)
   * Negative = below plane (opposite to normal)
   * Zero = on the plane
   * @param {THREE.Vector3} point - Point to test
   * @returns {number} Signed distance
   */
  signedDistanceToPoint(point) {
    // sd = (p · n) - d
    return point.dot(this.normal) - this.offset;
  }

  /**
   * Project a point onto the plane
   * @param {THREE.Vector3} point - Point to project
   * @param {THREE.Vector3} target - Target vector to store result (optional)
   * @returns {THREE.Vector3} Projected point on the plane
   */
  projectPoint(point, target) {
    const distance = this.signedDistanceToPoint(point);
    if (!target) {
      target = point.clone();
    } else {
      target.copy(point);
    }
    // projected = p - (distance * n)
    return target.addScaledVector(this.normal, -distance);
  }

  /**
   * Get local coordinate frame (tangent, bitangent, normal)
   * Uses Gram-Schmidt orthogonalization
   * @returns {Object} {tangent, bitangent, normal}
   */
  getLocalFrame() {
    const normal = this.normal.clone();
    
    // Choose an arbitrary vector not parallel to normal
    let arbitrary = normal.clone();
    if (Math.abs(normal.y) < 0.9) {
      arbitrary.set(0, 1, 0); // Use Y-up if normal isn't too vertical
    } else {
      arbitrary.set(1, 0, 0); // Use X-right if normal is vertical
    }
    
    // Gram-Schmidt: tangent = arbitrary - (arbitrary · n) * n
    const tangent = arbitrary.clone().addScaledVector(normal, -arbitrary.dot(normal)).normalize();
    
    // Bitangent = normal × tangent
    const bitangent = normal.clone().crossVectors(normal, tangent).normalize();
    
    return {
      tangent,
      bitangent,
      normal
    };
  }

  /**
   * Check if a point is on the plane (within tolerance)
   * @param {THREE.Vector3} point - Point to test
   * @param {number} tolerance - Distance tolerance (default: 1e-6)
   * @returns {boolean} True if point is on plane
   */
  isPointOnPlane(point, tolerance = 1e-6) {
    return Math.abs(this.signedDistanceToPoint(point)) < tolerance;
  }

  /**
   * Get the closest point on the plane to a given point
   * @param {THREE.Vector3} point - Point to find closest to
   * @param {THREE.Vector3} target - Target vector to store result (optional)
   * @returns {THREE.Vector3} Closest point on plane
   */
  closestPointToPoint(point, target) {
    return this.projectPoint(point, target);
  }
}
