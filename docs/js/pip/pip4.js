// PiP 4 - Tangential Velocity Field Visualization
// Visualizes tangential velocity (projected to contact plane) using HSV color encoding
// Physics: v_tangential = v_total - (v_total · n) * n (removes normal component)

export class PiP4 {
  constructor(pipRenderer) {
    this.pipRenderer = pipRenderer;
    this.canvasCtx = document.getElementById('pip4Canvas').getContext('2d', { willReadFrequently: true });
  }

  /**
   * Convert HSV to RGB
   * @param {number} h - Hue (0-1)
   * @param {number} s - Saturation (0-1)
   * @param {number} v - Value (0-1)
   * @returns {Array} [r, g, b] in 0-255 range
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
   * Calculate cross product for rotational velocity: ω × r
   * @param {Object} omega - Angular velocity {x, y, z}
   * @param {Object} r - Position vector {x, y, z}
   * @returns {Object} Cross product {x, y, z}
   */
  crossProduct(omega, r) {
    return {
      x: omega.y * r.z - omega.z * r.y,
      y: omega.z * r.x - omega.x * r.z,
      z: omega.x * r.y - omega.y * r.x
    };
  }

  /**
   * Render velocity vector field on intersection
   * @param {Uint8ClampedArray} pixels1 - Top view pixels
   * @param {Uint8ClampedArray} pixels2 - Bottom view pixels
   * @param {Object} velocity - Translational velocity {x, z} in world space
   * @param {Object} angularVelocity - Angular velocity {x, y, z} in rad/s
   * @param {Object} lastOBB - OBB data containing center and orientation
   */
  render(pixels1, pixels2, velocity, angularVelocity, lastOBB) {
    const W = this.pipRenderer.CFG.PIP_W;
    const H = this.pipRenderer.CFG.PIP_H;

    // Clear canvas
    this.canvasCtx.clearRect(0, 0, W, H);

    if (!velocity || !lastOBB) {
      return;
    }

    // Get OBB parameters for coordinate transformation
    const center = lastOBB.center; // World space center {x, y, z}
    const width = lastOBB.width;
    const height = lastOBB.height;
    const e1 = lastOBB.e1; // First basis vector (width direction)
    const e2 = lastOBB.e2; // Second basis vector (height direction)

    // Create output image
    const outputData = this.canvasCtx.createImageData(W, H);

    // Calculate max velocity for normalization (rough estimate)
    const v_trans_mag = Math.sqrt(velocity.x * velocity.x + velocity.z * velocity.z);
    const omega_mag = angularVelocity ? Math.sqrt(
      angularVelocity.x * angularVelocity.x +
      angularVelocity.y * angularVelocity.y +
      angularVelocity.z * angularVelocity.z
    ) : 0;
    const max_radius = Math.sqrt(width * width + height * height) / 2;
    const v_max = Math.max(5.0, v_trans_mag + omega_mag * max_radius); // At least 5 m/s for scaling

    // Process each pixel
    for (let y = 0; y < H; y++) {
      for (let x = 0; x < W; x++) {
        const idx = (y * W + x) * 4;

        // Check if pixel is in intersection
        const has1 = (pixels1[idx] | pixels1[idx+1] | pixels1[idx+2]) > 10;
        const has2 = (pixels2[idx] | pixels2[idx+1] | pixels2[idx+2]) > 10;

        if (has1 && has2) {
          // Convert pixel coordinates to normalized OBB local space (-0.5 to 0.5)
          const u = (x / W) - 0.5; // Normalized horizontal position
          const v = (y / H) - 0.5; // Normalized vertical position

          // Calculate world space position of this pixel
          // Position = center + u * width * e1 + v * height * e2
          const worldX = center.x + u * width * e1.x + v * height * e2.x;
          const worldZ = center.z + u * width * e1.z + v * height * e2.z;

          // Calculate position vector from center (r vector for angular velocity)
          const r = {
            x: worldX - center.x,
            y: 0, // Assuming planar motion at ground level
            z: worldZ - center.z
          };

          // Calculate rotational velocity component: v_rot = ω × r
          let v_rot = { x: 0, y: 0, z: 0 };
          if (angularVelocity) {
            v_rot = this.crossProduct(angularVelocity, r);
          }

          // Calculate total 3D velocity at point r: v_total = v_linear + v_rot
          const v_total = {
            x: velocity.x + v_rot.x,
            y: (velocity.y || 0) + v_rot.y,
            z: velocity.z + v_rot.z
          };

          // Contact plane normal (ground plane: pointing up)
          const normal = { x: 0, y: 1, z: 0 };

          // Project to tangent plane: v_tangential = v_total - (v_total · n) * n
          const v_dot_n = v_total.x * normal.x + v_total.y * normal.y + v_total.z * normal.z;
          const v_tangential = {
            x: v_total.x - v_dot_n * normal.x,
            y: v_total.y - v_dot_n * normal.y,
            z: v_total.z - v_dot_n * normal.z
          };

          // Calculate tangential velocity magnitude and direction
          const magnitude = Math.sqrt(v_tangential.x * v_tangential.x + v_tangential.z * v_tangential.z);
          const angle = Math.atan2(v_tangential.z, v_tangential.x);

          // Encode velocity as HSV color
          // Hue: direction angle (0-360° mapped to 0-1)
          const hue = (angle + Math.PI) / (2 * Math.PI);

          // Saturation: full saturation for all velocities
          const saturation = 1.0;

          // Value: magnitude (linear + angular at point r)
          // Normalized by v_max with minimum threshold
          const normalizedMag = Math.min(1.0, magnitude / v_max);
          const value = Math.max(0.3, normalizedMag); // Minimum 30% brightness for visibility

          // Convert HSV to RGB
          const [r_val, g_val, b_val] = this.hsvToRgb(hue, saturation, value);

          // Write to output
          outputData.data[idx] = r_val;
          outputData.data[idx + 1] = g_val;
          outputData.data[idx + 2] = b_val;
          outputData.data[idx + 3] = 255; // Full opacity
        } else {
          // Transparent outside intersection
          outputData.data[idx] = 0;
          outputData.data[idx + 1] = 0;
          outputData.data[idx + 2] = 0;
          outputData.data[idx + 3] = 0;
        }
      }
    }

    // Render to canvas
    this.canvasCtx.putImageData(outputData, 0, 0);
  }

  clear() {
    this.canvasCtx.clearRect(0, 0, this.pipRenderer.CFG.PIP_W, this.pipRenderer.CFG.PIP_H);
  }
}
