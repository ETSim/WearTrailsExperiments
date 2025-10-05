// PiP 5 - Instantaneous Pressure Map
// Shows real-time normal force (impact pressure) at intersection points
// No accumulation - displays current pressure only for performance

export class PiP5 {
  constructor(pipRenderer) {
    this.pipRenderer = pipRenderer;
    this.canvasCtx = document.getElementById('pip5Canvas').getContext('2d', { willReadFrequently: true });
    this.density = 1.0; // kg/m² - surface density
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
   * Render instantaneous pressure map (no accumulation)
   */
  render(pixels1, pixels2, velocity, angularVelocity, lastOBB) {
    const W = this.pipRenderer.CFG.PIP_W;
    const H = this.pipRenderer.CFG.PIP_H;

    // Clear canvas
    this.canvasCtx.clearRect(0, 0, W, H);

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

    // Temporary pressure storage for this frame
    const pressureMap = new Float32Array(W * H);
    let maxPressure = 0.01;

    // Calculate pressure for each pixel
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

          const worldX = center.x + u * width * e1.x + v * height * e2.x;
          const worldZ = center.z + u * width * e1.z + v * height * e2.z;

          // Position vector from center
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

          // Total 3D velocity
          const v_3d = {
            x: velocity.x + v_rot.x,
            y: v_rot.y,
            z: velocity.z + v_rot.z
          };

          // Calculate normal component: v · n
          const v_dot_n = v_3d.x * normal.x + v_3d.y * normal.y + v_3d.z * normal.z;

          // Calculate normal force (impact pressure): f_n = 0.5 * ρ * max(0, v · n)²
          const v_normal = Math.max(0, v_dot_n);
          const f_normal = 0.5 * this.density * v_normal * v_normal;

          pressureMap[idx] = f_normal;
          if (f_normal > maxPressure) {
            maxPressure = f_normal;
          }
        }
      }
    }

    // Render pressure map
    const outputData = this.canvasCtx.createImageData(W, H);

    for (let i = 0; i < pressureMap.length; i++) {
      const p = pressureMap[i];
      const idx = i * 4;

      if (p > 0.001) {
        // Normalize pressure
        const t = Math.min(1.0, p / maxPressure);

        // Thermal gradient: Blue → Cyan → Green → Yellow → Red
        let r, g, b;
        if (t < 0.25) {
          // Blue to Cyan
          r = 0;
          g = Math.round((t / 0.25) * 255);
          b = 255;
        } else if (t < 0.5) {
          // Cyan to Green
          r = 0;
          g = 255;
          b = Math.round((1 - (t - 0.25) / 0.25) * 255);
        } else if (t < 0.75) {
          // Green to Yellow
          r = Math.round(((t - 0.5) / 0.25) * 255);
          g = 255;
          b = 0;
        } else {
          // Yellow to Red
          r = 255;
          g = Math.round((1 - (t - 0.75) / 0.25) * 255);
          b = 0;
        }

        outputData.data[idx] = r;
        outputData.data[idx + 1] = g;
        outputData.data[idx + 2] = b;
        outputData.data[idx + 3] = 255;
      } else {
        // Transparent
        outputData.data[idx] = 0;
        outputData.data[idx + 1] = 0;
        outputData.data[idx + 2] = 0;
        outputData.data[idx + 3] = 0;
      }
    }

    // Render to canvas
    this.canvasCtx.putImageData(outputData, 0, 0);
  }

  clear() {
    this.canvasCtx.clearRect(0, 0, this.pipRenderer.CFG.PIP_W, this.pipRenderer.CFG.PIP_H);
  }
}
