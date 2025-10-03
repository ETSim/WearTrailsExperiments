// FieldFlowManager - Handles field intensity and flow direction layers
import * as THREE from 'three';
import { saveCanvasAsPNG } from '../utils.js';

export class FieldFlowManager {
  constructor(scene, CFG) {
    this.scene = scene;
    this.CFG = CFG;
    
    // Field intensity layer
    this.fieldCanvas = null;
    this.fieldCtx = null;
    this.fieldIntensity = null;
    this.fieldTexture = null;
    this.fieldOverlay = null;
    
    // Flow direction layer
    this.flowCanvas = null;
    this.flowCtx = null;
    this.flowDirX = null;
    this.flowDirZ = null;
    this.flowMagnitude = null;
    this.flowTexture = null;
    this.flowOverlay = null;
    
    // Combined layer
    this.combinedCanvas = null;
    this.combinedCtx = null;
    this.combinedTexture = null;
    this.combinedOverlay = null;
    
    // Configuration
    this.enableField = true;
    this.enableFlow = true;
    this.enableCombined = true;
    this.fieldGain = 1.0;
    this.flowAlpha = 0.8;
    this.similarityThreshold = 0.5;
  }

  // Initialize field and flow layers
  init() {
    this.createFieldLayer();
    this.createFlowLayer();
    this.createCombinedLayer();
    
    return {
      fieldCanvas: this.fieldCanvas,
      fieldTexture: this.fieldTexture,
      fieldOverlay: this.fieldOverlay,
      flowCanvas: this.flowCanvas,
      flowTexture: this.flowTexture,
      flowOverlay: this.flowOverlay,
      combinedCanvas: this.combinedCanvas,
      combinedTexture: this.combinedTexture,
      combinedOverlay: this.combinedOverlay
    };
  }

  createFieldLayer() {
    // Field Intensity Layer (Heat Map)
    this.fieldCanvas = document.createElement('canvas');
    this.fieldCanvas.width = 256;
    this.fieldCanvas.height = 256;
    this.fieldCtx = this.fieldCanvas.getContext('2d', { willReadFrequently: true });
    this.fieldCtx.fillStyle = 'black';
    this.fieldCtx.fillRect(0, 0, 256, 256);

    // Field accumulator: tracks intensity (number of stamps per pixel)
    this.fieldIntensity = new Float32Array(256 * 256);
    this.fieldTexture = new THREE.CanvasTexture(this.fieldCanvas);
    this.fieldTexture.wrapS = THREE.ClampToEdgeWrapping;
    this.fieldTexture.wrapT = THREE.ClampToEdgeWrapping;

    // Field intensity overlay
    this.fieldOverlay = new THREE.Mesh(
      new THREE.PlaneGeometry(this.CFG.PLANE_SIZE, this.CFG.PLANE_SIZE),
      new THREE.MeshBasicMaterial({
        map: this.fieldTexture,
        transparent: true,
        opacity: 0.7,
        side: THREE.FrontSide,
        depthWrite: false,
        blending: THREE.AdditiveBlending
      })
    );
    this.fieldOverlay.rotation.x = -Math.PI / 2;
    this.fieldOverlay.position.y = 0.02;
    this.fieldOverlay.visible = false;
    this.scene.add(this.fieldOverlay);
  }

  createFlowLayer() {
    // Flow Direction Layer
    this.flowCanvas = document.createElement('canvas');
    this.flowCanvas.width = 256;
    this.flowCanvas.height = 256;
    this.flowCtx = this.flowCanvas.getContext('2d', { willReadFrequently: true });
    this.flowCtx.fillStyle = 'black';
    this.flowCtx.fillRect(0, 0, 256, 256);

    // Flow accumulator: tracks direction (dirX, dirZ) and magnitude
    this.flowDirX = new Float32Array(256 * 256);
    this.flowDirZ = new Float32Array(256 * 256);
    this.flowMagnitude = new Float32Array(256 * 256);
    this.flowTexture = new THREE.CanvasTexture(this.flowCanvas);
    this.flowTexture.wrapS = THREE.ClampToEdgeWrapping;
    this.flowTexture.wrapT = THREE.ClampToEdgeWrapping;

    // Flow direction overlay
    this.flowOverlay = new THREE.Mesh(
      new THREE.PlaneGeometry(this.CFG.PLANE_SIZE, this.CFG.PLANE_SIZE),
      new THREE.MeshBasicMaterial({
        map: this.flowTexture,
        transparent: true,
        opacity: 0.7,
        side: THREE.FrontSide,
        depthWrite: false,
        blending: THREE.AdditiveBlending
      })
    );
    this.flowOverlay.rotation.x = -Math.PI / 2;
    this.flowOverlay.position.y = 0.03;
    this.flowOverlay.visible = false;
    this.scene.add(this.flowOverlay);
  }

  createCombinedLayer() {
    // Combined Layer (Flow + Field)
    this.combinedCanvas = document.createElement('canvas');
    this.combinedCanvas.width = 256;
    this.combinedCanvas.height = 256;
    this.combinedCtx = this.combinedCanvas.getContext('2d', { willReadFrequently: true });
    this.combinedCtx.fillStyle = 'black';
    this.combinedCtx.fillRect(0, 0, 256, 256);
    this.combinedTexture = new THREE.CanvasTexture(this.combinedCanvas);
    this.combinedTexture.wrapS = THREE.ClampToEdgeWrapping;
    this.combinedTexture.wrapT = THREE.ClampToEdgeWrapping;

    // Combined overlay (flow + field)
    this.combinedOverlay = new THREE.Mesh(
      new THREE.PlaneGeometry(this.CFG.PLANE_SIZE, this.CFG.PLANE_SIZE),
      new THREE.MeshBasicMaterial({
        map: this.combinedTexture,
        transparent: true,
        opacity: 0.8,
        side: THREE.FrontSide,
        depthWrite: false,
        blending: THREE.AdditiveBlending
      })
    );
    this.combinedOverlay.rotation.x = -Math.PI / 2;
    this.combinedOverlay.position.y = 0.04;
    this.combinedOverlay.visible = false;
    this.scene.add(this.combinedOverlay);
  }

  // Helper functions for field and flow
  worldToFieldPixel(worldX, worldZ) {
    const x = ((worldX + this.CFG.PLANE_SIZE / 2) / this.CFG.PLANE_SIZE) * 256;
    const y = ((worldZ + this.CFG.PLANE_SIZE / 2) / this.CFG.PLANE_SIZE) * 256;
    return { x: Math.floor(Math.max(0, Math.min(255, x))), y: Math.floor(Math.max(0, Math.min(255, y))) };
  }

  accumulateField(worldX, worldZ, normalForce = 1.0, radius = 10) {
    const center = this.worldToFieldPixel(worldX, worldZ);
    const radiusSq = radius * radius;
    
    // Normalize force to reasonable range (reference: 2kg at 9.81 m/s² = 19.62 N)
    const referenceForce = 2.0 * 9.81; // 19.62 N
    const forceMultiplier = Math.sqrt(normalForce / referenceForce); // Use sqrt for more gradual scaling
    const effectiveGain = this.fieldGain * forceMultiplier;
    
    for (let dy = -radius; dy <= radius; dy++) {
      for (let dx = -radius; dx <= radius; dx++) {
        const distSq = dx * dx + dy * dy;
        if (distSq <= radiusSq) {
          const px = center.x + dx;
          const py = center.y + dy;
          if (px >= 0 && px < 256 && py >= 0 && py < 256) {
            const idx = py * 256 + px;
            const falloff = 1.0 - Math.sqrt(distSq) / radius;
            this.fieldIntensity[idx] = Math.min(10.0, this.fieldIntensity[idx] + effectiveGain * falloff);
          }
        }
      }
    }
  }

  accumulateFlow(worldX, worldZ, velX, velZ, radius = 20) {
    const center = this.worldToFieldPixel(worldX, worldZ);
    const velMag = Math.sqrt(velX * velX + velZ * velZ);
    if (velMag < 0.01) return;
    
    const normVelX = velX / velMag;
    const normVelZ = velZ / velMag;
    const radiusSq = radius * radius;
    
    for (let dy = -radius; dy <= radius; dy++) {
      for (let dx = -radius; dx <= radius; dx++) {
        const distSq = dx * dx + dy * dy;
        if (distSq <= radiusSq) {
          const px = center.x + dx;
          const py = center.y + dy;
          if (px >= 0 && px < 256 && py >= 0 && py < 256) {
            const idx = py * 256 + px;
            const falloff = 1.0 - Math.sqrt(distSq) / radius;
            
            // Calculate cosine similarity with existing flow
            const existingMag = this.flowMagnitude[idx];
            let similarity = 1.0;
            
            if (existingMag > 0.01) {
              const existingDirX = this.flowDirX[idx] / existingMag;
              const existingDirZ = this.flowDirZ[idx] / existingMag;
              similarity = normVelX * existingDirX + normVelZ * existingDirZ;
            }
            
            // Only accumulate if similarity is above threshold
            if (similarity > this.similarityThreshold) {
              this.flowDirX[idx] += this.flowAlpha * normVelX * falloff * velMag;
              this.flowDirZ[idx] += this.flowAlpha * normVelZ * falloff * velMag;
              this.flowMagnitude[idx] = Math.sqrt(this.flowDirX[idx] * this.flowDirX[idx] + this.flowDirZ[idx] * this.flowDirZ[idx]);
            }
          }
        }
      }
    }
  }

  renderField() {
    const imgData = this.fieldCtx.createImageData(256, 256);
    const data = imgData.data;
    
    // Fixed normalization: 500 physical stamps = white (truly independent of fieldGain)
    // Convert accumulated intensity back to equivalent stamp count, then normalize
    const PASSES_FOR_WHITE = 500;
    
    for (let i = 0; i < this.fieldIntensity.length; i++) {
      // Calculate equivalent number of stamps (divide by current gain to get count)
      const equivalentStamps = this.fieldIntensity[i] / this.fieldGain;
      
      // Normalize: 500 stamps = 1.0 (white)
      const normalized = Math.min(1.0, equivalentStamps / PASSES_FOR_WHITE);
      const gray = Math.floor(255 * normalized);
      
      const idx = i * 4;
      // Grayscale: black (0) to white (255)
      data[idx] = gray;
      data[idx + 1] = gray;
      data[idx + 2] = gray;
      data[idx + 3] = Math.floor(255 * normalized); // Alpha matches intensity
    }
    
    this.fieldCtx.putImageData(imgData, 0, 0);
    this.fieldTexture.needsUpdate = true;
  }

  renderFlow() {
    const imgData = this.flowCtx.createImageData(256, 256);
    const data = imgData.data;
    
    // Find max magnitude for normalization
    let maxMag = 0;
    for (let i = 0; i < this.flowMagnitude.length; i++) {
      if (this.flowMagnitude[i] > maxMag) maxMag = this.flowMagnitude[i];
    }
    
    // Avoid division by zero
    if (maxMag < 0.01) maxMag = 1.0;
    
    for (let i = 0; i < this.flowMagnitude.length; i++) {
      const mag = this.flowMagnitude[i];
      const idx = i * 4;
      
      if (mag > 0.001) {
        // Normalize direction vector
        const dirX = this.flowDirX[i] / mag;
        const dirZ = this.flowDirZ[i] / mag;
        
        // Direction to hue (0-1) - standard flow map convention (V flipped)
        const angle = Math.atan2(dirZ, dirX); // V axis flipped
        const hue = (angle + Math.PI) / (2 * Math.PI); // 0-1
        
        // Normalize magnitude to 0-1 range
        const normalizedMag = Math.min(1.0, mag / maxMag);
        
        // Standard flow map: Hue = direction, Saturation = intensity, Value = 1
        const h = hue;
        const s = normalizedMag; // Intensity in saturation
        const v = 1.0; // Full brightness
        
        // HSV to RGB - robust conversion
        const i_h = Math.floor(h * 6);
        const f = h * 6 - i_h;
        const p = v * (1 - s);
        const q = v * (1 - f * s);
        const t = v * (1 - (1 - f) * s);
        
        let r, g, b;
        switch (i_h % 6) {
          case 0: r = v; g = t; b = p; break;
          case 1: r = q; g = v; b = p; break;
          case 2: r = p; g = v; b = t; break;
          case 3: r = p; g = q; b = v; break;
          case 4: r = t; g = p; b = v; break;
          case 5: r = v; g = p; b = q; break;
          default: r = v; g = t; b = p; break;
        }
        
        data[idx] = Math.floor(r * 255);
        data[idx + 1] = Math.floor(g * 255);
        data[idx + 2] = Math.floor(b * 255);
        data[idx + 3] = Math.floor(normalizedMag * 255); // Alpha = intensity
      } else {
        // No flow - transparent
        data[idx] = 0;
        data[idx + 1] = 0;
        data[idx + 2] = 0;
        data[idx + 3] = 0;
      }
    }
    
    this.flowCtx.putImageData(imgData, 0, 0);
    this.flowTexture.needsUpdate = true;
  }

  renderCombined() {
    const imgData = this.combinedCtx.createImageData(256, 256);
    const data = imgData.data;
    
    // Find max flow magnitude for normalization
    let maxMag = 0;
    for (let i = 0; i < this.flowMagnitude.length; i++) {
      if (this.flowMagnitude[i] > maxMag) maxMag = this.flowMagnitude[i];
    }
    if (maxMag < 0.01) maxMag = 1.0;
    
    // Fixed normalization for field
    const PASSES_FOR_WHITE = 500;
    
    for (let i = 0; i < 256 * 256; i++) {
      const idx = i * 4;
      
      // Get field intensity (0-1)
      const equivalentStamps = this.fieldIntensity[i] / this.fieldGain;
      const fieldValue = Math.min(1.0, equivalentStamps / PASSES_FOR_WHITE);
      
      // Get flow data
      const mag = this.flowMagnitude[i];
      
      if (mag > 0.001 && fieldValue > 0.01) {
        // Both flow and field present - combine them
        const dirX = this.flowDirX[i] / mag;
        const dirZ = this.flowDirZ[i] / mag;
        
        // Flow direction to hue (V-flipped)
        const angle = Math.atan2(dirZ, dirX);
        const hue = (angle + Math.PI) / (2 * Math.PI); // 0-1
        
        // Normalize flow magnitude
        const normalizedMag = Math.min(1.0, mag / maxMag);
        
        // Combined visualization:
        // - Hue = flow direction
        // - Saturation = flow magnitude
        // - Value = field intensity (how many times visited)
        const h = hue;
        const s = normalizedMag * 0.8; // Flow strength as saturation
        const v = fieldValue; // Field intensity as brightness
        
        // HSV to RGB
        const i_h = Math.floor(h * 6);
        const f = h * 6 - i_h;
        const p = v * (1 - s);
        const q = v * (1 - f * s);
        const t = v * (1 - (1 - f) * s);
        
        let r, g, b;
        switch (i_h % 6) {
          case 0: r = v; g = t; b = p; break;
          case 1: r = q; g = v; b = p; break;
          case 2: r = p; g = v; b = t; break;
          case 3: r = p; g = q; b = v; break;
          case 4: r = t; g = p; b = v; break;
          case 5: r = v; g = p; b = q; break;
          default: r = v; g = t; b = p; break;
        }
        
        data[idx] = Math.floor(r * 255);
        data[idx + 1] = Math.floor(g * 255);
        data[idx + 2] = Math.floor(b * 255);
        data[idx + 3] = Math.floor(fieldValue * 255); // Alpha based on field
      } else if (fieldValue > 0.01) {
        // Only field, no flow - show as white grayscale
        const gray = Math.floor(255 * fieldValue);
        data[idx] = gray;
        data[idx + 1] = gray;
        data[idx + 2] = gray;
        data[idx + 3] = Math.floor(fieldValue * 255);
      } else {
        // No data - transparent
        data[idx] = 0;
        data[idx + 1] = 0;
        data[idx + 2] = 0;
        data[idx + 3] = 0;
      }
    }
    
    this.combinedCtx.putImageData(imgData, 0, 0);
    this.combinedTexture.needsUpdate = true;
  }

  // Process stamp data for field and flow accumulation
  processStamp(worldX, worldZ, velocity, normalForce) {
    if (this.enableField) {
      this.accumulateField(worldX, worldZ, normalForce, 10);
      this.renderField();
    }
    
    if (this.enableFlow && velocity) {
      const velocityMag = Math.sqrt(velocity.x * velocity.x + velocity.z * velocity.z);
      if (velocityMag > 0.01) {
        this.accumulateFlow(worldX, worldZ, velocity.x, velocity.z, 20);
        this.renderFlow();
      }
    }
    
    if (this.enableCombined) {
      this.renderCombined();
    }
  }

  // Clear field data
  clearField() {
    this.fieldIntensity.fill(0);
    this.renderField();
  }

  // Clear flow data
  clearFlow() {
    this.flowDirX.fill(0);
    this.flowDirZ.fill(0);
    this.flowMagnitude.fill(0);
    this.renderFlow();
  }

  // Clear combined data
  clearCombined() {
    this.clearField();
    this.clearFlow();
    this.renderCombined();
  }

  // Save field as PNG
  saveField() {
    saveCanvasAsPNG(this.fieldCanvas, 'field_intensity.png');
  }

  // Save flow as PNG
  saveFlow() {
    saveCanvasAsPNG(this.flowCanvas, 'flow_direction.png');
  }

  // Save combined as PNG
  saveCombined() {
    saveCanvasAsPNG(this.combinedCanvas, 'combined_flow_field.png');
  }

  // Toggle field visibility
  toggleFieldVisibility(show) {
    if (this.fieldOverlay) {
      this.fieldOverlay.visible = show;
    }
  }

  // Toggle flow visibility
  toggleFlowVisibility(show) {
    if (this.flowOverlay) {
      this.flowOverlay.visible = show;
    }
  }

  // Toggle combined visibility
  toggleCombinedVisibility(show) {
    if (this.combinedOverlay) {
      this.combinedOverlay.visible = show;
    }
  }

  // Set field gain
  setFieldGain(gain) {
    this.fieldGain = gain;
  }

  // Set flow alpha
  setFlowAlpha(alpha) {
    this.flowAlpha = alpha;
  }

  // Set similarity threshold
  setSimilarityThreshold(threshold) {
    this.similarityThreshold = threshold;
  }

  // Get configuration
  getConfig() {
    return {
      enableField: this.enableField,
      enableFlow: this.enableFlow,
      enableCombined: this.enableCombined,
      fieldGain: this.fieldGain,
      flowAlpha: this.flowAlpha,
      similarityThreshold: this.similarityThreshold
    };
  }

  // Cleanup method
  dispose() {
    if (this.fieldOverlay) {
      this.scene.remove(this.fieldOverlay);
      this.fieldOverlay = null;
    }
    
    if (this.flowOverlay) {
      this.scene.remove(this.flowOverlay);
      this.flowOverlay = null;
    }
    
    if (this.combinedOverlay) {
      this.scene.remove(this.combinedOverlay);
      this.combinedOverlay = null;
    }
    
    this.fieldCanvas = null;
    this.fieldCtx = null;
    this.fieldIntensity = null;
    this.fieldTexture = null;
    
    this.flowCanvas = null;
    this.flowCtx = null;
    this.flowDirX = null;
    this.flowDirZ = null;
    this.flowMagnitude = null;
    this.flowTexture = null;
    
    this.combinedCanvas = null;
    this.combinedCtx = null;
    this.combinedTexture = null;
  }
}
