// PiP 6 - Bidirectional Wear Map with HSV Flow Field Encoding
// Shows wear accumulation as bidirectional flow field using HSV encoding
// HSV: Hue = flow direction (0-360°), Saturation = full (100%), Value = wear strength (0-1)
// Accumulates wear over time and repetition - NO DECAY
// Works with both rigid and soft bodies

export class PiP6 {
  constructor(pipRenderer) {
    this.pipRenderer = pipRenderer;
    this.canvasCtx = document.getElementById('pip6Canvas').getContext('2d', { willReadFrequently: true });
    this.density = 1.0; // kg/m² - surface density

    // Wear accumulation for time and repetition tracking (no decay)
    const W = this.pipRenderer.CFG.PIP_W;
    const H = this.pipRenderer.CFG.PIP_H;
    this.wearAccumulation = new Float32Array(W * H);
    this.wearDirectionX = new Float32Array(W * H); // Store wear direction X component
    this.wearDirectionZ = new Float32Array(W * H); // Store wear direction Z component
    this.directionSaturation = new Float32Array(W * H); // Directional consistency (starts at 0.01)
    this.wearAlpha = 0.1; // Accumulation factor per frame

    // Adaptive threshold (only increases, never decreases)
    this.maxWearThreshold = 0.01;

    // Direction reinforcement parameters
    this.minSaturation = 0.01; // Starting saturation
    this.cosineSimilarityThreshold = 0.7; // Direction similarity threshold
    this.saturationGrowthRate = 0.05; // How much saturation increases per accumulation event
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
   * Accumulate wear over time and contact repetition (no decay)
   * Tracks bidirectional wear with direction information
   */
  accumulate(pixels1, pixels2, velocity, angularVelocity, normalForce, lastOBB) {
    const W = this.pipRenderer.CFG.PIP_W;
    const H = this.pipRenderer.CFG.PIP_H;

    if (!velocity || !lastOBB) {
      return;
    }

    // Get OBB parameters
    const center = lastOBB.center;
    const width = lastOBB.width;
    const height = lastOBB.height;
    const e1 = lastOBB.e1;
    const e2 = lastOBB.e2;

    // Contact plane normal (ground plane: pointing up)
    const normal = { x: 0, y: 1, z: 0 };

    // Process each pixel
    for (let y = 0; y < H; y++) {
      for (let x = 0; x < W; x++) {
        const idx = y * W + x;
        const pixelIdx = idx * 4;

        // Check if pixel is in intersection
        const has1 = (pixels1[pixelIdx] | pixels1[pixelIdx+1] | pixels1[pixelIdx+2]) > 10;
        const has2 = (pixels2[pixelIdx] | pixels2[pixelIdx+1] | pixels2[pixelIdx+2]) > 10;

        if (has1 && has2) {
          // Convert pixel to world space
          const u = (x / W) - 0.5;
          const v = (y / H) - 0.5;

          // Calculate world space position of this pixel
          // Position = center + u * width * e1 + v * height * e2
          const worldX = center.x + u * width * e1.x + v * height * e2.x;
          const worldZ = center.z + u * width * e1.z + v * height * e2.z;

          // Position vector from center (r vector for angular velocity)
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

          // Total 3D velocity (linear + rotational)
          const v_3d = {
            x: velocity.x + v_rot.x,
            y: (velocity.y || 0) + v_rot.y,
            z: velocity.z + v_rot.z
          };

          // Calculate normal component: v · n (bidirectional)
          const v_dot_n = v_3d.x * normal.x + v_3d.y * normal.y + v_3d.z * normal.z;

          // Project to tangent plane: v_tangential = v - (v · n) * n
          const v_tangential = {
            x: v_3d.x - v_dot_n * normal.x,
            y: v_3d.y - v_dot_n * normal.y,
            z: v_3d.z - v_dot_n * normal.z
          };

          // Calculate tangential velocity magnitude (bidirectional)
          const v_tangential_mag = Math.sqrt(
            v_tangential.x * v_tangential.x +
            v_tangential.z * v_tangential.z
          );

          // Use actual contact force from physics simulation
          // Add minimum force threshold to ensure wear accumulates during all contact
          const minForce = 10.0; // Minimum contact force (prevents zero multiplication)
          const contactForce = normalForce ? Math.max(minForce, normalForce) : minForce;

          // Track dominant direction and calculate directional consistency
          if (v_tangential_mag > 0.001) {
            const normDirX = v_tangential.x / v_tangential_mag;
            const normDirZ = v_tangential.z / v_tangential_mag;

            const currentDirMag = Math.sqrt(
              this.wearDirectionX[idx] * this.wearDirectionX[idx] +
              this.wearDirectionZ[idx] * this.wearDirectionZ[idx]
            );

            // Initialize saturation if first contact
            if (this.directionSaturation[idx] === 0) {
              this.directionSaturation[idx] = this.minSaturation;
            }

            let directionMultiplier = 1.0;

            // Calculate cosine similarity if we have an existing direction
            if (currentDirMag > 0.01) {
              const storedDirX = this.wearDirectionX[idx] / currentDirMag;
              const storedDirZ = this.wearDirectionZ[idx] / currentDirMag;

              // Cosine similarity: dot product of normalized vectors
              const cosineSimilarity = normDirX * storedDirX + normDirZ * storedDirZ;

              // If direction is similar (cosine similarity > threshold), reinforce it
              if (cosineSimilarity >= this.cosineSimilarityThreshold) {
                // Apply wear multiplier based on current saturation (1.0 to 3.0)
                // More consistent direction = more wear
                directionMultiplier = 1.0 + this.directionSaturation[idx] * 2.0;

                // Increase saturation AFTER calculating multiplier (for next accumulation)
                // This ensures it grows with each accumulation event, not per frame
                this.directionSaturation[idx] = Math.min(1.0,
                  this.directionSaturation[idx] + this.saturationGrowthRate
                );
              } else {
                // Direction changed - reset saturation to minimum
                this.directionSaturation[idx] = this.minSaturation;
              }
            }

            // Wear formula: Tangential Velocity × Contact Force × Direction Multiplier
            // Reinforces wear when direction is consistent
            const wearRate = v_tangential_mag * contactForce * this.wearAlpha * directionMultiplier;

            // Accumulate wear over time - NO DECAY
            // Tracks contact duration and repetition
            this.wearAccumulation[idx] += wearRate;

            // Update direction - blend weighted by wear contribution
            const blendFactor = wearRate / (this.wearAccumulation[idx] + wearRate);
            this.wearDirectionX[idx] = this.wearDirectionX[idx] * (1 - blendFactor) + normDirX * blendFactor;
            this.wearDirectionZ[idx] = this.wearDirectionZ[idx] * (1 - blendFactor) + normDirZ * blendFactor;
          }
        }
      }
    }
  }

  /**
   * Render wear map as bidirectional flow field with HSV encoding
   * Hue = flow direction (0-360°), Saturation = full (100%), Value = wear strength (0-1)
   */
  render(pixels1, pixels2, velocity, angularVelocity, normalForce, lastOBB) {
    const W = this.pipRenderer.CFG.PIP_W;
    const H = this.pipRenderer.CFG.PIP_H;

    // Clear canvas
    this.canvasCtx.clearRect(0, 0, W, H);

    if (!velocity || !lastOBB) {
      return;
    }

    // Update adaptive threshold (only increases, never decreases)
    // This prevents existing pixels from dimming as new wear accumulates
    let currentMaxWear = 0.01;
    for (let i = 0; i < this.wearAccumulation.length; i++) {
      if (this.wearAccumulation[i] > currentMaxWear) {
        currentMaxWear = this.wearAccumulation[i];
      }
    }

    // Only increase threshold, never decrease (prevents dimming)
    if (currentMaxWear > this.maxWearThreshold) {
      this.maxWearThreshold = currentMaxWear;
    }

    // Create output image
    const outputData = this.canvasCtx.createImageData(W, H);

    // Process each pixel
    for (let y = 0; y < H; y++) {
      for (let x = 0; x < W; x++) {
        const idx = y * W + x;
        const pixelIdx = idx * 4;

        // Check if pixel is in intersection
        const has1 = (pixels1[pixelIdx] | pixels1[pixelIdx+1] | pixels1[pixelIdx+2]) > 10;
        const has2 = (pixels2[pixelIdx] | pixels2[pixelIdx+1] | pixels2[pixelIdx+2]) > 10;

        if (has1 && has2) {
          // Get accumulated wear
          const wear = this.wearAccumulation[idx];

          if (wear > 0.001) {
            // Get wear direction
            const dirX = this.wearDirectionX[idx];
            const dirZ = this.wearDirectionZ[idx];

            // Calculate angle from direction vector
            const angle = Math.atan2(dirZ, dirX);

            // HSV Encoding for bidirectional flow field:
            // Hue: Direction of flow (wear direction)
            // Saturation: Directional consistency (0.01 to 1.0) - increases with repeated similar direction
            // Value: Wear strength (0-1) - logarithmic scaling

            // Map angle to hue (0-1): -π to π maps to 0 to 1
            const hue = (angle + Math.PI) / (2 * Math.PI);

            // Saturation: directional consistency (starts at 0.01, increases to 1.0)
            // Low saturation = inconsistent/changing direction (desaturated color)
            // High saturation = consistent direction (pure color)
            const saturation = Math.max(this.minSaturation, this.directionSaturation[idx]);

            // Value: logarithmic scaling for better dynamic range
            // Prevents old pixels from dimming as new wear accumulates
            const value = Math.min(1.0,
              Math.log(1 + wear * 100) / Math.log(1 + this.maxWearThreshold * 100)
            );

            // Convert HSV to RGB
            const [r_val, g_val, b_val] = this.hsvToRgb(hue, saturation, value);

            // Write to output
            outputData.data[pixelIdx] = r_val;
            outputData.data[pixelIdx + 1] = g_val;
            outputData.data[pixelIdx + 2] = b_val;
            outputData.data[pixelIdx + 3] = Math.round(Math.min(255, value * 255)); // Alpha based on strength
          } else {
            // Transparent
            outputData.data[pixelIdx] = 0;
            outputData.data[pixelIdx + 1] = 0;
            outputData.data[pixelIdx + 2] = 0;
            outputData.data[pixelIdx + 3] = 0;
          }
        } else {
          // Transparent outside intersection
          outputData.data[pixelIdx] = 0;
          outputData.data[pixelIdx + 1] = 0;
          outputData.data[pixelIdx + 2] = 0;
          outputData.data[pixelIdx + 3] = 0;
        }
      }
    }

    // Render to canvas
    this.canvasCtx.putImageData(outputData, 0, 0);
  }

  clear() {
    this.canvasCtx.clearRect(0, 0, this.pipRenderer.CFG.PIP_W, this.pipRenderer.CFG.PIP_H);
    // Clear wear accumulation
    this.wearAccumulation.fill(0);
    this.wearDirectionX.fill(0);
    this.wearDirectionZ.fill(0);
    this.directionSaturation.fill(0);
    // Reset adaptive threshold
    this.maxWearThreshold = 0.01;
  }

  /**
   * Get raw RGBA data (useful for export)
   */
  getRawData() {
    const W = this.pipRenderer.CFG.PIP_W;
    const H = this.pipRenderer.CFG.PIP_H;
    return this.canvasCtx.getImageData(0, 0, W, H);
  }
}
