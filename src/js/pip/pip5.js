// PiP 5 - Pressure Map with Grayscale Encoding
// Shows accumulated normal force (impact pressure) over time and repetition
// Uses grayscale encoding: 0 (black) = no pressure, 1 (white) = max pressure strength
// No decay - accumulates contact time and repetition
// Works with both rigid and soft bodies

export class PiP5 {
  constructor(pipRenderer) {
    this.pipRenderer = pipRenderer;
    this.canvasCtx = document.getElementById('pip5Canvas').getContext('2d', { willReadFrequently: true });
    this.density = 1.0; // kg/m² - surface density

    // Pressure accumulation for time and repetition tracking (no decay)
    const W = this.pipRenderer.CFG.PIP_W;
    const H = this.pipRenderer.CFG.PIP_H;
    this.pressureAccumulation = new Float32Array(W * H);
    this.pressureAlpha = 0.1; // Accumulation factor per frame

    // Adaptive threshold (only increases, never decreases)
    this.maxPressureThreshold = 0.01;
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
   * Accumulate pressure over time and contact repetition (no decay)
   */
  accumulate(pixels1, pixels2, velocity, angularVelocity, lastOBB) {
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

          // Calculate normal component: v · n
          const v_dot_n = v_3d.x * normal.x + v_3d.y * normal.y + v_3d.z * normal.z;

          // Calculate normal force (impact pressure): f_n = 0.5 * ρ * max(0, v · n)²
          const v_normal = Math.max(0, v_dot_n);
          const f_normal = 0.5 * this.density * v_normal * v_normal;

          // Accumulate pressure over time - NO DECAY
          // Tracks contact duration and repetition
          this.pressureAccumulation[idx] += this.pressureAlpha * f_normal;
        }
      }
    }
  }

  /**
   * Render pressure map with grayscale encoding
   * 0 (black) = no pressure, 1 (white) = maximum pressure strength
   * Only displays pressure within current intersection area
   */
  render(pixels1, pixels2, velocity, angularVelocity, lastOBB) {
    const W = this.pipRenderer.CFG.PIP_W;
    const H = this.pipRenderer.CFG.PIP_H;

    // Clear canvas
    this.canvasCtx.clearRect(0, 0, W, H);

    if (!velocity || !lastOBB) {
      return;
    }

    // Update adaptive threshold (only increases, never decreases)
    // This prevents existing pixels from dimming as new pressure accumulates
    let currentMaxPressure = 0.01;
    for (let i = 0; i < this.pressureAccumulation.length; i++) {
      if (this.pressureAccumulation[i] > currentMaxPressure) {
        currentMaxPressure = this.pressureAccumulation[i];
      }
    }

    // Only increase threshold, never decrease (prevents dimming)
    if (currentMaxPressure > this.maxPressureThreshold) {
      this.maxPressureThreshold = currentMaxPressure;
    }

    // Create output image
    const outputData = this.canvasCtx.createImageData(W, H);

    // Process each pixel - only render within intersection area
    for (let y = 0; y < H; y++) {
      for (let x = 0; x < W; x++) {
        const idx = y * W + x;
        const pixelIdx = idx * 4;

        // Check if pixel is in current intersection (REQUIRED)
        const has1 = (pixels1[pixelIdx] | pixels1[pixelIdx+1] | pixels1[pixelIdx+2]) > 10;
        const has2 = (pixels2[pixelIdx] | pixels2[pixelIdx+1] | pixels2[pixelIdx+2]) > 10;

        // Only render pressure within active intersection area
        if (has1 && has2) {
          // Get accumulated pressure
          const pressure = this.pressureAccumulation[idx];

          if (pressure > 0.001) {
            // Logarithmic scaling for better dynamic range
            // Prevents old pixels from dimming as new pressure accumulates
            const normalizedPressure = Math.min(1.0,
              Math.log(1 + pressure * 100) / Math.log(1 + this.maxPressureThreshold * 100)
            );

            // Grayscale encoding: brightness = pressure strength
            // 0 (black) = no pressure, 1 (white) = maximum pressure
            const grayValue = Math.round(normalizedPressure * 255);

            // Write grayscale to RGB channels
            outputData.data[pixelIdx] = grayValue;
            outputData.data[pixelIdx + 1] = grayValue;
            outputData.data[pixelIdx + 2] = grayValue;
            outputData.data[pixelIdx + 3] = 255; // Full opacity
          } else {
            // Transparent
            outputData.data[pixelIdx] = 0;
            outputData.data[pixelIdx + 1] = 0;
            outputData.data[pixelIdx + 2] = 0;
            outputData.data[pixelIdx + 3] = 0;
          }
        } else {
          // Transparent outside intersection area
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
    // Clear pressure accumulation
    this.pressureAccumulation.fill(0);
    // Reset adaptive threshold
    this.maxPressureThreshold = 0.01;
  }
}
