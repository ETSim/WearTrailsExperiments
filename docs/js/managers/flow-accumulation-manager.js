// FlowAccumulationManager - Ground-based wear accumulation with HSVA encoding
// Tracks wear patterns on ground plane using energy dissipation model

export class FlowAccumulationManager {
  constructor(scene, CFG, THREE) {
    this.scene = scene;
    this.CFG = CFG;
    this.THREE = THREE;
    this.flowCanvas = null;
    this.flowCtx = null;
    this.flowTexture = null;
    this.flowOverlay = null;

    // Accumulators
    this.flowDirX = null;              // Average direction X (for visualization)
    this.flowDirZ = null;              // Average direction Z (for visualization)
    this.wearAccumulation = null;      // Accumulated wear: K × traction × velocity
    this.tractionAccumulation = null;  // τ = μ × σ_n (normal force/traction)
    this.velocityAccumulation = null;  // v_tangential (sliding speed magnitude)
    this.lastUpdateTime = null;        // Last update timestamp per pixel (for EMA decay)

    // Parameters - Energy Dissipation Model
    this.K = 0.15;           // Wear coefficient (dimensionless) - controls accumulation rate
    this.density = 1.0;      // kg/m² - surface density
    this.tau = 1.0;          // Time constant for direction EMA decay (seconds)
    // Note: Friction coefficient (μ) is taken from window.bodyManager.friction
  }

  init() {
    // Flow accumulation canvas (same resolution as stamps)
    this.flowCanvas = document.createElement('canvas');
    this.flowCanvas.width = 2048;
    this.flowCanvas.height = 2048;
    this.flowCtx = this.flowCanvas.getContext('2d', { willReadFrequently: true, alpha: true });

    // Initialize accumulators
    const size = this.flowCanvas.width * this.flowCanvas.height;
    this.flowDirX = new Float32Array(size);
    this.flowDirZ = new Float32Array(size);
    this.wearAccumulation = new Float32Array(size);
    this.tractionAccumulation = new Float32Array(size);
    this.velocityAccumulation = new Float32Array(size);
    this.lastUpdateTime = new Float32Array(size); // Initialize to 0 (never updated)

    // Clear canvas
    this.flowCtx.clearRect(0, 0, 2048, 2048);

    // Create texture
    this.flowTexture = new this.THREE.CanvasTexture(this.flowCanvas);
    this.flowTexture.wrapS = this.THREE.ClampToEdgeWrapping;
    this.flowTexture.wrapT = this.THREE.ClampToEdgeWrapping;
    this.flowTexture.minFilter = this.THREE.LinearFilter;
    this.flowTexture.magFilter = this.THREE.LinearFilter;

    // Flow overlay on ground
    this.flowOverlay = new this.THREE.Mesh(
      new this.THREE.PlaneGeometry(this.CFG.PLANE_SIZE, this.CFG.PLANE_SIZE),
      new this.THREE.MeshBasicMaterial({
        map: this.flowTexture,
        color: 0xffffff,
        transparent: true,
        opacity: 0.9,
        side: this.THREE.FrontSide,
        depthWrite: false,
        depthTest: false,
        blending: this.THREE.NormalBlending
      })
    );
    this.flowOverlay.rotation.x = -Math.PI / 2;
    this.flowOverlay.position.y = 0.03; // Above stamps
    this.flowOverlay.receiveShadow = false;
    this.flowOverlay.castShadow = false;
    this.flowOverlay.visible = false;
    this.flowOverlay.renderOrder = 999;
    this.scene.add(this.flowOverlay);

    return {
      flowCanvas: this.flowCanvas,
      flowCtx: this.flowCtx,
      flowTexture: this.flowTexture,
      flowOverlay: this.flowOverlay
    };
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
   * Convert HSV to RGB
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
   * Convert value to thermal color (black → blue → cyan → yellow → red → white)
   * Same color scheme as PiP6 for consistent visualization
   */
  thermalColor(intensity) {
    const t = Math.max(0, Math.min(1, intensity));

    let r, g, b;

    if (t < 0.25) {
      // Black → Blue (0.0 - 0.25)
      const s = t / 0.25;
      r = 0;
      g = 0;
      b = Math.round(s * 255);
    } else if (t < 0.5) {
      // Blue → Cyan (0.25 - 0.5)
      const s = (t - 0.25) / 0.25;
      r = 0;
      g = Math.round(s * 255);
      b = 255;
    } else if (t < 0.75) {
      // Cyan → Yellow (0.5 - 0.75)
      const s = (t - 0.5) / 0.25;
      r = Math.round(s * 255);
      g = 255;
      b = Math.round((1 - s) * 255);
    } else {
      // Yellow → Red → White (0.75 - 1.0)
      const s = (t - 0.75) / 0.25;
      r = 255;
      g = Math.round((1 - s * 0.5) * 255);
      b = Math.round(s * 255);
    }

    return [r, g, b];
  }

  /**
   * Accumulate energy dissipation wear at stamping location
   * Wear = K × (Tangential Traction × Tangential Velocity)
   * Wear = K × (μ × σ_n × v_tangential)
   */
  accumulate(pixels1, pixels2, velocity, angularVelocity, normalForceValue, lastOBB, stampWorldX, stampWorldZ) {
    if (!velocity || !lastOBB) return;

    // Get current time for EMA decay (in seconds)
    const currentTime = performance.now() / 1000;

    const W_pip = this.CFG.PIP_W;
    const H_pip = this.CFG.PIP_H;
    const W_canvas = this.flowCanvas.width;
    const H_canvas = this.flowCanvas.height;

    // Get OBB parameters
    const center = lastOBB.center;
    const width = lastOBB.width;
    const height = lastOBB.height;
    const e1 = lastOBB.e1;
    const e2 = lastOBB.e2;

    // Contact plane normal (ground plane: pointing up)
    const normal = { x: 0, y: 1, z: 0 };

    // Calculate stamp size
    const paddedWidth = width * window.state.paddingWidthScale;
    const paddedHeight = height * window.state.paddingHeightScale;
    const stampSizeWorld = Math.max(paddedWidth, paddedHeight);

    // FIRST PASS: Count intersection pixels and calculate contact area
    let intersectionPixelCount = 0;
    for (let y = 0; y < H_pip; y++) {
      for (let x = 0; x < W_pip; x++) {
        const pipIdx = (y * W_pip + x) * 4;
        const has1 = (pixels1[pipIdx] | pixels1[pipIdx+1] | pixels1[pipIdx+2]) > 10;
        const has2 = (pixels2[pipIdx] | pixels2[pipIdx+1] | pixels2[pipIdx+2]) > 10;
        if (has1 && has2) {
          intersectionPixelCount++;
        }
      }
    }

    // Calculate contact area in world units
    // Each pixel represents a portion of the OBB area
    const pixelAreaWorld = (width * height) / (W_pip * H_pip);
    const contactArea = intersectionPixelCount * pixelAreaWorld;

    // Calculate pressure: P = F / A (force per unit area)
    // Avoid division by zero
    const pressure = contactArea > 0.001 ? normalForceValue / contactArea : 0;

    // SECOND PASS: Process each pixel in intersection with accurate pressure
    for (let y = 0; y < H_pip; y++) {
      for (let x = 0; x < W_pip; x++) {
        const pipIdx = (y * W_pip + x) * 4;

        // Check if pixel is in intersection
        const has1 = (pixels1[pipIdx] | pixels1[pipIdx+1] | pixels1[pipIdx+2]) > 10;
        const has2 = (pixels2[pipIdx] | pixels2[pipIdx+1] | pixels2[pipIdx+2]) > 10;

        if (has1 && has2) {
          // Convert PiP pixel to world space (relative to OBB center)
          const u = (x / W_pip) - 0.5;
          const v = (y / H_pip) - 0.5;

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

          // Project to tangent plane (remove normal component)
          const v_dot_n = v_3d.x * normal.x + v_3d.y * normal.y + v_3d.z * normal.z;
          const v_tangential = {
            x: v_3d.x - v_dot_n * normal.x,
            y: v_3d.y - v_dot_n * normal.y,
            z: v_3d.z - v_dot_n * normal.z
          };

          // Use accurate pressure from contact force distribution
          // Pressure is already calculated as total normal force / contact area
          // Each intersection pixel gets an equal share of the pressure

          // Calculate tangential velocity magnitude
          const velMag = Math.sqrt(
            v_tangential.x * v_tangential.x +
            v_tangential.z * v_tangential.z
          );

          if (velMag > 0.01) {
            // Map world coordinates to ground canvas coordinates
            const canvasX = Math.round(((worldX + this.CFG.PLANE_SIZE / 2) / this.CFG.PLANE_SIZE) * W_canvas);
            const canvasY = Math.round(((worldZ + this.CFG.PLANE_SIZE / 2) / this.CFG.PLANE_SIZE) * H_canvas);

            // Check bounds
            if (canvasX >= 0 && canvasX < W_canvas && canvasY >= 0 && canvasY < H_canvas) {
              const canvasIdx = canvasY * W_canvas + canvasX;

              // Normalize direction
              const normDirX = v_tangential.x / velMag;
              const normDirZ = v_tangential.z / velMag;

              // Energy dissipation wear formula:
              // Wear = K × Traction × Velocity
              // Wear = K × (μ × σ_n) × v_tangential

              // Get friction coefficient from physics simulation
              const mu = window.bodyManager ? window.bodyManager.friction : 0.5;

              // No wear if no friction
              if (mu <= 0) {
                continue;
              }

              // Calculate tangential traction (shear stress): τ = μ × σ_n
              const tangential_traction = mu * pressure;

              // Calculate energy dissipation (power per unit area)
              const energyDissipation = tangential_traction * velMag;

              // Store all three quantities separately
              this.tractionAccumulation[canvasIdx] += tangential_traction;
              this.velocityAccumulation[canvasIdx] += velMag;

              // Keep wear accumulation for variant blending compatibility
              const wearRate = this.K * energyDissipation;
              this.wearAccumulation[canvasIdx] += wearRate;

              // Direction blending with time-based EMA decay
              // α(dt) = exp(-dt/τ) where τ ~ 1s
              // newDir = oldDir * α + newDir * (1 - α)
              const lastTime = this.lastUpdateTime[canvasIdx];
              const dt = lastTime > 0 ? currentTime - lastTime : 0;

              // Calculate exponential decay factor
              // α closer to 1 = more smoothing, α closer to 0 = faster adaptation
              const alpha = lastTime > 0 ? Math.exp(-dt / this.tau) : 0;

              // EMA blend: old direction decays over time, new direction weighted by (1-α)
              const blendedX = this.flowDirX[canvasIdx] * alpha + normDirX * (1 - alpha);
              const blendedZ = this.flowDirZ[canvasIdx] * alpha + normDirZ * (1 - alpha);

              // Normalize to maintain unit vector
              const blendedMag = Math.sqrt(blendedX * blendedX + blendedZ * blendedZ);
              if (blendedMag > 1e-9) {
                this.flowDirX[canvasIdx] = blendedX / blendedMag;
                this.flowDirZ[canvasIdx] = blendedZ / blendedMag;
              } else {
                // Fallback: just use new direction if blend magnitude is too small
                this.flowDirX[canvasIdx] = normDirX;
                this.flowDirZ[canvasIdx] = normDirZ;
              }

              // Update timestamp
              this.lastUpdateTime[canvasIdx] = currentTime;
            }
          }
        }
      }
    }
  }

  /**
   * Render accumulated wear with HSVA color encoding
   * H (Hue): Sliding direction angle (0-360°)
   * S (Saturation): Tangential velocity magnitude (0-1)
   * V (Value): Normal force / Traction magnitude (0-1)
   * A (Alpha): Combined wear intensity (0-1)
   */
  render() {
    const W = this.flowCanvas.width;
    const H = this.flowCanvas.height;

    // Find max values for normalization
    let maxTraction = 0.01;
    let maxVelocity = 0.01;
    let maxWear = 0.01;

    for (let i = 0; i < this.tractionAccumulation.length; i++) {
      if (this.tractionAccumulation[i] > maxTraction) maxTraction = this.tractionAccumulation[i];
      if (this.velocityAccumulation[i] > maxVelocity) maxVelocity = this.velocityAccumulation[i];
      if (this.wearAccumulation[i] > maxWear) maxWear = this.wearAccumulation[i];
    }

    // Create output image
    const outputData = this.flowCtx.createImageData(W, H);

    for (let i = 0; i < this.tractionAccumulation.length; i++) {
      const idx = i * 4;
      const traction = this.tractionAccumulation[i];
      const velocity = this.velocityAccumulation[i];
      const wear = this.wearAccumulation[i];
      const dirX = this.flowDirX[i];
      const dirZ = this.flowDirZ[i];

      if (traction > 0.001 || velocity > 0.001 || wear > 0.001) {
        // Calculate sliding direction angle (Hue)
        const angle = Math.atan2(dirZ, dirX);
        const hue = (angle + Math.PI) / (2 * Math.PI); // 0-1

        // Normalize quantities to 0-1 range
        const saturation = Math.min(1.0, velocity / maxVelocity);  // S = velocity
        const value = Math.min(1.0, traction / maxTraction);        // V = traction
        const alpha = Math.min(1.0, wear / maxWear);               // A = wear

        // Convert HSV to RGB
        const [r, g, b] = this.hsvToRgb(hue, saturation, value);

        // Write RGBA
        outputData.data[idx] = r;
        outputData.data[idx + 1] = g;
        outputData.data[idx + 2] = b;
        outputData.data[idx + 3] = Math.round(alpha * 255);
      } else {
        // Transparent
        outputData.data[idx] = 0;
        outputData.data[idx + 1] = 0;
        outputData.data[idx + 2] = 0;
        outputData.data[idx + 3] = 0;
      }
    }

    // Render to canvas
    this.flowCtx.putImageData(outputData, 0, 0);
    this.flowTexture.needsUpdate = true;
  }

  /**
   * Generate flow map texture from direction data
   * RG channels encode normalized direction (-1 to 1 mapped to 0 to 1)
   * Alpha channel encodes direction magnitude/validity
   */
  generateFlowMapTexture(THREE) {
    const W = this.flowCanvas.width;
    const H = this.flowCanvas.height;

    // Create flow map canvas
    const flowCanvas = document.createElement('canvas');
    flowCanvas.width = W;
    flowCanvas.height = H;
    const flowCtx = flowCanvas.getContext('2d');

    // Create image data
    const flowData = flowCtx.createImageData(W, H);

    for (let i = 0; i < this.flowDirX.length; i++) {
      const idx = i * 4;
      const dirX = this.flowDirX[i];
      const dirZ = this.flowDirZ[i];

      // Calculate direction magnitude
      const mag = Math.sqrt(dirX * dirX + dirZ * dirZ);

      if (mag > 0.01) {
        // Normalize direction
        const normDirX = dirX / mag;
        const normDirZ = dirZ / mag;

        // Map from [-1, 1] to [0, 255]
        const r = Math.round((normDirX * 0.5 + 0.5) * 255);
        const g = Math.round((normDirZ * 0.5 + 0.5) * 255);

        flowData.data[idx] = r;
        flowData.data[idx + 1] = g;
        flowData.data[idx + 2] = 128; // Unused, set to middle value
        flowData.data[idx + 3] = Math.min(255, Math.round(mag * 255)); // Alpha = magnitude
      } else {
        // No flow direction
        flowData.data[idx] = 128; // Middle value (no direction)
        flowData.data[idx + 1] = 128;
        flowData.data[idx + 2] = 128;
        flowData.data[idx + 3] = 0; // Transparent
      }
    }

    flowCtx.putImageData(flowData, 0, 0);

    // Create Three.js texture
    const flowTexture = new THREE.CanvasTexture(flowCanvas);
    flowTexture.colorSpace = THREE.NoColorSpace;
    flowTexture.wrapS = THREE.ClampToEdgeWrapping;
    flowTexture.wrapT = THREE.ClampToEdgeWrapping;
    flowTexture.minFilter = THREE.LinearFilter;
    flowTexture.magFilter = THREE.LinearFilter;

    return flowTexture;
  }

  /**
   * Generate grayscale blend map texture from wear accumulation
   * Returns normalized wear intensity (0-1) as grayscale for variant blending
   */
  generateWearBlendTexture(THREE) {
    const W = this.flowCanvas.width;
    const H = this.flowCanvas.height;

    // Find max wear for normalization
    let maxWear = 0.01;
    for (let i = 0; i < this.wearAccumulation.length; i++) {
      if (this.wearAccumulation[i] > maxWear) {
        maxWear = this.wearAccumulation[i];
      }
    }

    // Create blend map canvas
    const blendCanvas = document.createElement('canvas');
    blendCanvas.width = W;
    blendCanvas.height = H;
    const blendCtx = blendCanvas.getContext('2d');

    // Create image data
    const blendData = blendCtx.createImageData(W, H);

    for (let i = 0; i < this.wearAccumulation.length; i++) {
      const idx = i * 4;
      const wear = this.wearAccumulation[i];

      // Normalize to 0-1 range
      const normalizedWear = Math.min(1.0, wear / maxWear);

      // Grayscale: 0 (black) = no wear, 255 (white) = max wear
      const grayValue = Math.round(normalizedWear * 255);

      blendData.data[idx] = grayValue;
      blendData.data[idx + 1] = grayValue;
      blendData.data[idx + 2] = grayValue;
      blendData.data[idx + 3] = 255; // Full opacity
    }

    blendCtx.putImageData(blendData, 0, 0);

    // Create Three.js texture
    const blendTexture = new THREE.CanvasTexture(blendCanvas);
    blendTexture.colorSpace = THREE.NoColorSpace;
    blendTexture.wrapS = THREE.ClampToEdgeWrapping;
    blendTexture.wrapT = THREE.ClampToEdgeWrapping;
    blendTexture.minFilter = THREE.LinearFilter;
    blendTexture.magFilter = THREE.LinearFilter;

    return blendTexture;
  }

  /**
   * Get wear accumulation texture for use as blend map
   * Deprecated: Use generateWearBlendTexture() for variant blending
   */
  getWearBlendTexture() {
    return this.flowTexture;
  }

  /**
   * Splat pip6 accumulated wear onto ground canvas
   * Takes pip6's 256x256 accumulated wear data and maps it to ground coordinates
   */
  splatPip6Wear(pip6WearData, pip6DirectionX, pip6DirectionZ, pip6Width, pip6Height, lastOBB, stampWorldX, stampWorldZ) {
    if (!lastOBB || !pip6WearData) return;

    const W_pip = pip6Width;
    const H_pip = pip6Height;
    const W_canvas = this.flowCanvas.width;
    const H_canvas = this.flowCanvas.height;

    // Get OBB parameters
    const center = lastOBB.center;
    const width = lastOBB.width;
    const height = lastOBB.height;
    const e1 = lastOBB.e1;
    const e2 = lastOBB.e2;

    // Process each pixel in pip6 canvas
    for (let y = 0; y < H_pip; y++) {
      for (let x = 0; x < W_pip; x++) {
        const pipIdx = y * W_pip + x;

        // Get pip6 accumulated wear at this pixel
        const wearValue = pip6WearData[pipIdx];

        if (wearValue > 0.001) {
          // Convert PiP pixel to world space (relative to OBB center)
          const u = (x / W_pip) - 0.5;
          const v = (y / H_pip) - 0.5;

          const worldX = center.x + u * width * e1.x + v * height * e2.x;
          const worldZ = center.z + u * width * e1.z + v * height * e2.z;

          // Map world coordinates to ground canvas coordinates
          const canvasX = Math.round(((worldX + this.CFG.PLANE_SIZE / 2) / this.CFG.PLANE_SIZE) * W_canvas);
          const canvasY = Math.round(((worldZ + this.CFG.PLANE_SIZE / 2) / this.CFG.PLANE_SIZE) * H_canvas);

          // Check bounds
          if (canvasX >= 0 && canvasX < W_canvas && canvasY >= 0 && canvasY < H_canvas) {
            const canvasIdx = canvasY * W_canvas + canvasX;

            // Add pip6 wear to ground accumulation (scaled by flowAlpha for consistency)
            this.wearAccumulation[canvasIdx] += wearValue * this.flowAlpha;
            this.energyWearAccumulation[canvasIdx] += wearValue * this.flowAlpha;

            // Transfer direction data from pip6
            const dirX = pip6DirectionX[pipIdx];
            const dirZ = pip6DirectionZ[pipIdx];

            const dirMag = Math.sqrt(dirX * dirX + dirZ * dirZ);

            if (dirMag > 0.01) {
              // Normalize direction
              const normDirX = dirX / dirMag;
              const normDirZ = dirZ / dirMag;

              // Update ground direction (weighted blend)
              const currentDirMag = Math.sqrt(
                this.flowDirX[canvasIdx] * this.flowDirX[canvasIdx] +
                this.flowDirZ[canvasIdx] * this.flowDirZ[canvasIdx]
              );

              if (currentDirMag < 0.01) {
                // First direction - just set it
                this.flowDirX[canvasIdx] = normDirX;
                this.flowDirZ[canvasIdx] = normDirZ;
              } else {
                // Blend with existing direction (weighted by wear contribution)
                const totalWear = this.wearAccumulation[canvasIdx];
                const blendFactor = (wearValue * this.flowAlpha) / totalWear;
                this.flowDirX[canvasIdx] = this.flowDirX[canvasIdx] * (1 - blendFactor) + normDirX * blendFactor;
                this.flowDirZ[canvasIdx] = this.flowDirZ[canvasIdx] * (1 - blendFactor) + normDirZ * blendFactor;
              }
            }
          }
        }
      }
    }
  }

  clearFlow() {
    this.flowDirX.fill(0);
    this.flowDirZ.fill(0);
    this.wearAccumulation.fill(0);
    this.tractionAccumulation.fill(0);
    this.velocityAccumulation.fill(0);
    this.lastUpdateTime.fill(0); // Reset timestamps
    this.flowCtx.clearRect(0, 0, this.flowCanvas.width, this.flowCanvas.height);
    this.flowTexture.needsUpdate = true;
  }
}
