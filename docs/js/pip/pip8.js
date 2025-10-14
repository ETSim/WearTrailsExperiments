// PiP 8 - Local Wear Map
// Shows instantaneous local wear in the contact region
// Wear = Local Pressure × Friction × Local Tangential Velocity

export class PiP8 {
  constructor(pipRenderer) {
    this.pipRenderer = pipRenderer;
    this.canvasCtx = document.getElementById('pip8Canvas').getContext('2d');
  }

  clear() {
    this.canvasCtx.clearRect(0, 0, this.pipRenderer.CFG.PIP_W, this.pipRenderer.CFG.PIP_H);
  }

  render(pixels1, pixels2, velocity, angularVelocity, normalForce, lastOBB) {
    if (!lastOBB || !velocity) {
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

    // Get friction coefficient
    const mu = window.bodyManager ? window.bodyManager.friction : 0.5;

    // Calculate contact area for pressure
    let intersectionPixelCount = 0;
    for (let y = 0; y < H; y++) {
      for (let x = 0; x < W; x++) {
        const pixelIdx = (y * W + x) * 4;
        const has1 = (pixels1[pixelIdx + 3] > 10);
        const has2 = (pixels2[pixelIdx + 3] > 10);
        if (has1 && has2) {
          intersectionPixelCount++;
        }
      }
    }

    const pixelAreaWorld = (width * height) / (W * H);
    const contactArea = intersectionPixelCount * pixelAreaWorld;
    const pressure = contactArea > 0.001 ? (normalForce || 0) / contactArea : 0;

    // Get ground velocity
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
        // Ground is static
      }
    }

    let maxWear = 0;
    const wearData = [];

    // Calculate local wear for each pixel
    for (let y = 0; y < H; y++) {
      for (let x = 0; x < W; x++) {
        const pixelIdx = (y * W + x) * 4;

        // ONLY process intersection pixels (where both bodies overlap)
        const has1 = (pixels1[pixelIdx + 3] > 10);
        const has2 = (pixels2[pixelIdx + 3] > 10);
        const isIntersection = has1 && has2;
        
        if (!isIntersection) {
          wearData.push(0);
          continue;
        }

        // Convert pixel to world coordinates
        const u = (x / W) - 0.5;
        const v = (y / H) - 0.5;

        const worldX = center.x + u * width * e1.x + v * height * e2.x;
        const worldY = center.y + u * width * e1.y + v * height * e2.y;
        const worldZ = center.z + u * width * e1.z + v * height * e2.z;

        // Calculate relative tangential velocity at this point
        const r = { x: worldX - center.x, y: worldY - center.y, z: worldZ - center.z };

        // Object rotational velocity
        let v_rot_obj = { x: 0, y: 0, z: 0 };
        if (angularVelocity) {
          v_rot_obj.x = angularVelocity.y * r.z - angularVelocity.z * r.y;
          v_rot_obj.y = angularVelocity.z * r.x - angularVelocity.x * r.z;
          v_rot_obj.z = angularVelocity.x * r.y - angularVelocity.y * r.x;
        }

        // Ground rotational velocity
        const r_ground = { x: worldX, y: 0, z: worldZ };
        let v_rot_ground = { x: 0, y: 0, z: 0 };
        v_rot_ground.x = groundAngularVelocity.y * r_ground.z - groundAngularVelocity.z * r_ground.y;
        v_rot_ground.y = groundAngularVelocity.z * r_ground.x - groundAngularVelocity.x * r_ground.z;
        v_rot_ground.z = groundAngularVelocity.x * r_ground.y - groundAngularVelocity.y * r_ground.x;

        // Total velocities
        const v_obj = {
          x: velocity.x + v_rot_obj.x,
          y: velocity.y + v_rot_obj.y,
          z: velocity.z + v_rot_obj.z
        };

        const v_ground = {
          x: groundVelocity.x + v_rot_ground.x,
          y: groundVelocity.y + v_rot_ground.y,
          z: groundVelocity.z + v_rot_ground.z
        };

        // Relative velocity
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

        const tangentialVelocity = Math.sqrt(
          v_tangential.x * v_tangential.x +
          v_tangential.y * v_tangential.y +
          v_tangential.z * v_tangential.z
        );

        // Local wear = Pressure × Friction × Tangential Velocity
        const localWear = pressure * mu * tangentialVelocity;

        wearData.push(localWear);
        if (localWear > maxWear) {
          maxWear = localWear;
        }
      }
    }

    // Render with thermal colormap - only intersection pixels
    for (let i = 0; i < wearData.length; i++) {
      const pixelIdx = i * 4;
      const wear = wearData[i];

      if (wear > 0 && maxWear > 0) {
        const normalized = Math.min(1.0, wear / maxWear);
        const color = this.thermalColor(normalized);
        out[pixelIdx] = color.r;
        out[pixelIdx + 1] = color.g;
        out[pixelIdx + 2] = color.b;
        out[pixelIdx + 3] = 255;
      } else {
        // Clear non-intersection or zero-wear pixels
        out[pixelIdx] = 0;
        out[pixelIdx + 1] = 0;
        out[pixelIdx + 2] = 0;
        out[pixelIdx + 3] = 0;
      }
    }

    this.canvasCtx.putImageData(imageData, 0, 0);

    // Update UI
    const maxWearEl = document.getElementById('pip8MaxWear');
    if (maxWearEl) {
      maxWearEl.textContent = `${maxWear.toFixed(3)} W/m²`;
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
}
