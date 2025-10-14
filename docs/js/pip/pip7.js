// PiP 7 - Local Sliding Distance with Unit Vector Visualization
// Shows direction and magnitude of sliding in the current contact zone

export class PiP7 {
  constructor(pipRenderer) {
    this.pipRenderer = pipRenderer;
    this.canvasCtx = document.getElementById('pip7Canvas').getContext('2d', { willReadFrequently: true });
    
    // Store sliding distance magnitudes (persistent accumulation)
    const size = pipRenderer.CFG.PIP_W * pipRenderer.CFG.PIP_H;
    this.storedMagnitudes = new Float32Array(size);
    this.maxStoredMagnitude = 0;
  }

  clear() {
    this.canvasCtx.clearRect(0, 0, this.pipRenderer.CFG.PIP_W, this.pipRenderer.CFG.PIP_H);
  }

  clearMagnitudes() {
    this.storedMagnitudes.fill(0);
    this.maxStoredMagnitude = 0;
    console.log('PiP7 magnitude storage cleared');
  }

  render(pixels1, pixels2, velocity, angularVelocity, lastOBB, timestep = 0.001) {
    if (!velocity || !lastOBB) {
      this.clear();
      return;
    }

    const W = this.pipRenderer.CFG.PIP_W;
    const H = this.pipRenderer.CFG.PIP_H;
    const imageData = this.canvasCtx.createImageData(W, H);
    const out = imageData.data;

    const center = lastOBB.center;
    const n = new this.pipRenderer.THREE.Vector3(lastOBB.n.x, lastOBB.n.y, lastOBB.n.z).normalize();
    const e1 = new this.pipRenderer.THREE.Vector3(lastOBB.e1.x, lastOBB.e1.y, lastOBB.e1.z).normalize();
    const e2 = new this.pipRenderer.THREE.Vector3().crossVectors(n, e1).normalize();

    const width = lastOBB.width;
    const height = lastOBB.height;

    // Get ground velocity (relative motion)
    let groundVelocity = { x: 0, y: 0, z: 0 };
    let groundAngularVelocity = { x: 0, y: 0, z: 0 };
    
    if (window.groundManager && window.groundManager.groundBody) {
      try {
        const gv = window.groundManager.groundBody.getLinearVelocity();
        groundVelocity = { x: gv.x(), y: gv.y(), z: gv.z() };
        window.A.destroy(gv);
        
        const gav = window.groundManager.groundBody.getAngularVelocity();
        groundAngularVelocity = { x: gav.x(), y: gav.y(), z: gav.z() };
        window.A.destroy(gav);
      } catch (e) {
        // Ground is static, velocities remain zero
      }
    }

    let maxSlidingDist = 0;

    // Calculate sliding distance and direction for each pixel
    const slidingData = [];
    for (let y = 0; y < H; y++) {
      for (let x = 0; x < W; x++) {
        const pixelIdx = (y * W + x) * 4;

        // ONLY process intersection pixels (where both bodies overlap)
        const has1 = (pixels1[pixelIdx + 3] > 10);
        const has2 = (pixels2[pixelIdx + 3] > 10);
        const isIntersection = has1 && has2;

        if (!isIntersection) {
          // Clear non-intersection pixels
          out[pixelIdx] = 0;
          out[pixelIdx + 1] = 0;
          out[pixelIdx + 2] = 0;
          out[pixelIdx + 3] = 0;
          continue;
        }

        // Convert pixel to world coordinates
        const u = (x / W) - 0.5;
        const v = (y / H) - 0.5;

        const worldX = center.x + u * width * e1.x + v * height * e2.x;
        const worldY = center.y + u * width * e1.y + v * height * e2.y;
        const worldZ = center.z + u * width * e1.z + v * height * e2.z;

        // Position vector from center (for object rotation)
        const r = { x: worldX - center.x, y: worldY - center.y, z: worldZ - center.z };

        // Object rotational velocity: v_rot_obj = ω_obj × r
        let v_rot_obj = { x: 0, y: 0, z: 0 };
        if (angularVelocity) {
          v_rot_obj.x = angularVelocity.y * r.z - angularVelocity.z * r.y;
          v_rot_obj.y = angularVelocity.z * r.x - angularVelocity.x * r.z;
          v_rot_obj.z = angularVelocity.x * r.y - angularVelocity.y * r.x;
        }

        // Ground rotational velocity at this point: v_rot_ground = ω_ground × r_ground
        // (For ground contact, r_ground is from ground center to contact point)
        const r_ground = { x: worldX, y: 0, z: worldZ };
        let v_rot_ground = { x: 0, y: 0, z: 0 };
        v_rot_ground.x = groundAngularVelocity.y * r_ground.z - groundAngularVelocity.z * r_ground.y;
        v_rot_ground.y = groundAngularVelocity.z * r_ground.x - groundAngularVelocity.x * r_ground.z;
        v_rot_ground.z = groundAngularVelocity.x * r_ground.y - groundAngularVelocity.y * r_ground.x;

        // Object total velocity
        const v_obj = {
          x: velocity.x + v_rot_obj.x,
          y: velocity.y + v_rot_obj.y,
          z: velocity.z + v_rot_obj.z
        };

        // Ground total velocity
        const v_ground = {
          x: groundVelocity.x + v_rot_ground.x,
          y: groundVelocity.y + v_rot_ground.y,
          z: groundVelocity.z + v_rot_ground.z
        };

        // Relative velocity (object - ground)
        const v_3d = {
          x: v_obj.x - v_ground.x,
          y: v_obj.y - v_ground.y,
          z: v_obj.z - v_ground.z
        };

        // Project to tangent plane
        const v_dot_n = v_3d.x * n.x + v_3d.y * n.y + v_3d.z * n.z;
        const v_tangential = {
          x: v_3d.x - v_dot_n * n.x,
          y: v_3d.y - v_dot_n * n.y,
          z: v_3d.z - v_dot_n * n.z
        };

        const velMag = Math.sqrt(
          v_tangential.x * v_tangential.x +
          v_tangential.y * v_tangential.y +
          v_tangential.z * v_tangential.z
        );

        // Sliding distance = velocity × timestep
        let slidingDist = velMag * timestep;

        // Emphasize angular momentum contribution (rotational effects)
        // Calculate relative rotational velocity magnitude at this point
        const v_rot_relative = {
          x: v_rot_obj.x - v_rot_ground.x,
          y: v_rot_obj.y - v_rot_ground.y,
          z: v_rot_obj.z - v_rot_ground.z
        };
        const v_rot_mag = Math.sqrt(v_rot_relative.x ** 2 + v_rot_relative.y ** 2 + v_rot_relative.z ** 2);

        // Weight sliding distance by ratio of rotational to total relative velocity
        // This emphasizes points where rotation dominates
        const totalVelMag = Math.sqrt(v_3d.x ** 2 + v_3d.y ** 2 + v_3d.z ** 2);
        const rotationalWeight = totalVelMag > 0.01 ? v_rot_mag / totalVelMag : 0;

        // Apply stronger emphasis on rotational component (angular momentum)
        // Min 20% for pure linear motion, 100% for pure rotation
        const angularMomentumWeight = 0.2 + 0.8 * rotationalWeight;
        const weightedSlidingDist = slidingDist * angularMomentumWeight;

        // Store magnitude (accumulate over time)
        const idx = y * W + x;
        this.storedMagnitudes[idx] += weightedSlidingDist;
        if (this.storedMagnitudes[idx] > this.maxStoredMagnitude) {
          this.maxStoredMagnitude = this.storedMagnitudes[idx];
        }

        if (weightedSlidingDist > maxSlidingDist) {
          maxSlidingDist = weightedSlidingDist;
        }

        // Unit vector of sliding direction (for color encoding)
        let unitX = 0, unitZ = 0;
        if (velMag > 0.01) {
          unitX = v_tangential.x / velMag;
          unitZ = v_tangential.z / velMag;
        }

        slidingData.push({
          pixelIdx,
          slidingDist: weightedSlidingDist,  // Use weighted distance for display
          unitX,
          unitZ
        });
      }
    }

    // Render with HSV encoding: Hue = direction, Saturation = 1, Value = magnitude
    for (const data of slidingData) {
      if (data.slidingDist === 0) continue;

      // Calculate hue from direction (0-360 degrees)
      const angle = Math.atan2(data.unitZ, data.unitX);
      const hue = ((angle + Math.PI) / (2 * Math.PI)) * 360;

      // Value (brightness) based on magnitude
      const value = maxSlidingDist > 0 ? Math.min(1.0, data.slidingDist / maxSlidingDist) : 0;

      // HSV to RGB with full saturation
      const rgb = this.hsvToRgb(hue, 1.0, value);

      out[data.pixelIdx] = rgb.r;
      out[data.pixelIdx + 1] = rgb.g;
      out[data.pixelIdx + 2] = rgb.b;
      out[data.pixelIdx + 3] = 255;
    }

    this.canvasCtx.putImageData(imageData, 0, 0);

    // Update UI
    const maxDistEl = document.getElementById('pip7MaxDist');
    if (maxDistEl) {
      maxDistEl.textContent = `${(maxSlidingDist * 1000).toFixed(2)} mm`;
    }
  }

  /**
   * HSV to RGB conversion
   */
  hsvToRgb(h, s, v) {
    h = h / 60;
    const c = v * s;
    const x = c * (1 - Math.abs((h % 2) - 1));
    const m = v - c;

    let r1, g1, b1;
    if (h < 1) { r1 = c; g1 = x; b1 = 0; }
    else if (h < 2) { r1 = x; g1 = c; b1 = 0; }
    else if (h < 3) { r1 = 0; g1 = c; b1 = x; }
    else if (h < 4) { r1 = 0; g1 = x; b1 = c; }
    else if (h < 5) { r1 = x; g1 = 0; b1 = c; }
    else { r1 = c; g1 = 0; b1 = x; }

    return {
      r: Math.round((r1 + m) * 255),
      g: Math.round((g1 + m) * 255),
      b: Math.round((b1 + m) * 255)
    };
  }
}

