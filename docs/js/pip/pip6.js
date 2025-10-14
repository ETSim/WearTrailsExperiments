// PiP 6 - Accumulated Sliding Distance from Ground Canvas
// Shows the global sliding distance map accumulated on the ground
// Samples from the sliding distance manager's accumulated data at the current OBB contact region

export class PiP6 {
  constructor(pipRenderer) {
    this.pipRenderer = pipRenderer;
    this.canvasCtx = document.getElementById('pip6Canvas').getContext('2d', { willReadFrequently: true });
  }

  /**
   * Render accumulated sliding distance from ground canvas
   * Samples from the sliding distance manager's accumulated data
   */
  render(pixels1, pixels2, velocity, angularVelocity, normalForce, lastOBB, timestep = 0.001, slidingDistanceManager = null) {
    if (!slidingDistanceManager || !lastOBB) {
      this.clear();
      return;
    }

    const W_pip = this.pipRenderer.CFG.PIP_W;
    const H_pip = this.pipRenderer.CFG.PIP_H;
    const W_canvas = 2048;
    const H_canvas = 2048;

    const imageData = this.canvasCtx.createImageData(W_pip, H_pip);
    const out = imageData.data;

    const center = lastOBB.center;
    const e1 = new this.pipRenderer.THREE.Vector3(lastOBB.e1.x, lastOBB.e1.y, lastOBB.e1.z).normalize();
    const n = new this.pipRenderer.THREE.Vector3(lastOBB.n.x, lastOBB.n.y, lastOBB.n.z).normalize();
    const e2 = new this.pipRenderer.THREE.Vector3().crossVectors(n, e1).normalize();

    const width = lastOBB.width;
    const height = lastOBB.height;
    const groundSize = slidingDistanceManager.groundSize;

    // Get accumulated sliding distance data
    const accumulatedData = slidingDistanceManager.accumulatedSlidingDistance;
    const maxDist = slidingDistanceManager.maxSlidingDistance;

    let localMaxDist = 0;

    // Sample from accumulated data at OBB region
    for (let y = 0; y < H_pip; y++) {
      for (let x = 0; x < W_pip; x++) {
        const pixelIdx = (y * W_pip + x) * 4;

        const u = (x / W_pip) - 0.5;
        const v = (y / H_pip) - 0.5;

        const worldX = center.x + u * width * e1.x + v * height * e2.x;
        const worldZ = center.z + u * width * e1.z + v * height * e2.z;

        const canvasX = Math.round(((worldX + groundSize / 2) / groundSize) * W_canvas);
        const canvasY = Math.round(((worldZ + groundSize / 2) / groundSize) * H_canvas);

        if (canvasX >= 0 && canvasX < W_canvas && canvasY >= 0 && canvasY < H_canvas) {
          const canvasIdx = canvasY * W_canvas + canvasX;
          const slidingDist = accumulatedData[canvasIdx] || 0;

          if (slidingDist > localMaxDist) {
            localMaxDist = slidingDist;
          }

          // Apply thermal colormap
          if (slidingDist > 0 && maxDist > 0) {
            const normalized = Math.min(1.0, slidingDist / maxDist);
            const color = this.thermalColor(normalized);
            out[pixelIdx] = color.r;
            out[pixelIdx + 1] = color.g;
            out[pixelIdx + 2] = color.b;
            out[pixelIdx + 3] = 255;
          } else {
            out[pixelIdx] = 0;
            out[pixelIdx + 1] = 0;
            out[pixelIdx + 2] = 0;
            out[pixelIdx + 3] = 255;
          }
        } else {
          out[pixelIdx] = 0;
          out[pixelIdx + 1] = 0;
          out[pixelIdx + 2] = 0;
          out[pixelIdx + 3] = 255;
        }
      }
    }

    this.canvasCtx.putImageData(imageData, 0, 0);

    // Update UI with local max in this view
    const maxDistEl = document.getElementById('pip6MaxDist');
    if (maxDistEl) {
      maxDistEl.textContent = `${(localMaxDist * 1000).toFixed(2)} mm`;
    }
  }

  /**
   * Thermal colormap: black -> blue -> cyan -> yellow -> red
   */
  thermalColor(t) {
    t = Math.max(0, Math.min(1, t));
    let r, g, b;

    if (t < 0.25) {
      const s = t / 0.25;
      r = 0; g = 0; b = Math.round(255 * s);
    } else if (t < 0.5) {
      const s = (t - 0.25) / 0.25;
      r = 0; g = Math.round(255 * s); b = 255;
    } else if (t < 0.75) {
      const s = (t - 0.5) / 0.25;
      r = Math.round(255 * s); g = 255; b = Math.round(255 * (1 - s));
    } else {
      const s = (t - 0.75) / 0.25;
      r = 255; g = Math.round(255 * (1 - s * 0.5)); b = 0;
    }

    return { r, g, b };
  }

  clear() {
    this.canvasCtx.clearRect(0, 0, this.pipRenderer.CFG.PIP_W, this.pipRenderer.CFG.PIP_H);
  }
}
