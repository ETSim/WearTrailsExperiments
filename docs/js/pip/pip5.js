// PiP 5 - Instant Tangential Contact Traction Map
// Shows instantaneous tangential traction (local shear stress) - NO ACCUMULATION
// Traction: τ = μ × σ_n (shear stress = friction coefficient × normal pressure)
// Units: N/m² (Pascals)
// Uses grayscale encoding: 0 (black) = no traction, 1 (white) = max traction
// Instant visualization - shows current contact state only
// Works with both rigid and soft bodies

export class PiP5 {
  constructor(pipRenderer) {
    this.pipRenderer = pipRenderer;
    this.canvasCtx = document.getElementById('pip5Canvas').getContext('2d', { willReadFrequently: true });
    this.density = 1.0; // kg/m² - surface density
    this.frictionCoefficient = 0.5; // μ - friction coefficient for traction calculation

    // Adaptive threshold for normalization
    this.maxTractionThreshold = 1.0;
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
   * Render instant tangential traction map with grayscale encoding
   * 0 (black) = no traction, 1 (white) = maximum traction strength
   * Only displays instant traction within current intersection area - NO ACCUMULATION
   */
  render(pixels1, pixels2, velocity, angularVelocity, normalForce, lastOBB) {
    const W = this.pipRenderer.CFG.PIP_W;
    const H = this.pipRenderer.CFG.PIP_H;

    // Clear canvas
    this.canvasCtx.clearRect(0, 0, W, H);

    if (!velocity || !lastOBB) {
      return;
    }

    // Get friction coefficient from physics simulation
    const mu = window.bodyManager ? window.bodyManager.friction : 0.5;

    // No traction if no friction
    if (mu <= 0) {
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

    // FIRST PASS: Count intersection pixels to calculate contact area
    let intersectionPixelCount = 0;
    for (let y = 0; y < H; y++) {
      for (let x = 0; x < W; x++) {
        const pixelIdx = (y * W + x) * 4;
        const has1 = (pixels1[pixelIdx] | pixels1[pixelIdx+1] | pixels1[pixelIdx+2]) > 10;
        const has2 = (pixels2[pixelIdx] | pixels2[pixelIdx+1] | pixels2[pixelIdx+2]) > 10;
        if (has1 && has2) {
          intersectionPixelCount++;
        }
      }
    }

    // Calculate contact area in world units
    const pixelAreaWorld = (width * height) / (W * H);
    const contactArea = intersectionPixelCount * pixelAreaWorld;

    // Calculate unified static pressure: P = F / A
    const pressure = contactArea > 0.001 ? (normalForce || 0) / contactArea : 0;

    // Create output image
    const outputData = this.canvasCtx.createImageData(W, H);

    // Track max traction for normalization
    let maxTractionThisFrame = 0.01;

    // SECOND PASS: calculate all tractions and find max
    const tractionMap = new Float32Array(W * H);

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

          // Project to tangent plane: v_tangential = v - (v · n) * n
          const v_tangential = {
            x: v_3d.x - v_dot_n * normal.x,
            y: v_3d.y - v_dot_n * normal.y,
            z: v_3d.z - v_dot_n * normal.z
          };

          // Calculate tangential velocity magnitude (sliding velocity)
          const v_tangential_mag = Math.sqrt(
            v_tangential.x * v_tangential.x +
            v_tangential.z * v_tangential.z
          );

          // Calculate tangential traction using unified pressure model
          // τ = μ × p, where p = F / A (static pressure from solver)
          const tangential_traction = mu * pressure;

          // Only show if there's actual tangential motion
          if (v_tangential_mag > 0.001 && tangential_traction > 0.001) {
            tractionMap[idx] = tangential_traction;
            if (tangential_traction > maxTractionThisFrame) {
              maxTractionThisFrame = tangential_traction;
            }
          }
        }
      }
    }

    // Second pass: render with normalization
    for (let y = 0; y < H; y++) {
      for (let x = 0; x < W; x++) {
        const idx = y * W + x;
        const pixelIdx = idx * 4;

        const traction = tractionMap[idx];

        if (traction > 0.001) {
          // Normalize to 0-1 range
          const normalizedTraction = Math.min(1.0, traction / maxTractionThisFrame);

          // Grayscale encoding: brightness = traction strength
          // 0 (black) = no traction, 1 (white) = maximum traction
          const grayValue = Math.round(normalizedTraction * 255);

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
      }
    }

    // Render to canvas
    this.canvasCtx.putImageData(outputData, 0, 0);
  }

  clear() {
    this.canvasCtx.clearRect(0, 0, this.pipRenderer.CFG.PIP_W, this.pipRenderer.CFG.PIP_H);
  }
}
