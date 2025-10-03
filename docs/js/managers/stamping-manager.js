// StampingManager - Handles ground stamping functionality
import * as THREE from 'three';
import { saveCanvasAsPNG } from '../utils.js';

export class StampingManager {
  constructor(scene, CFG) {
    this.scene = scene;
    this.CFG = CFG;
    
    this.stampCanvas = null;
    this.stampCtx = null;
    this.stampTexture = null;
    this.stampOverlay = null;
    
    this.enableStamping = true;
    this.stampLineStencil = true;
    this.showStamps = false;
    this.useBBoxCenter = false;
    this.lineIntensityScale = 1.0;
    this.stampInterval = 280;
    this.lastStampTime = 0;
  }

  // Initialize stamping system
  init() {
    this.createStampCanvas();
    this.createStampOverlay();
    
    return {
      stampCanvas: this.stampCanvas,
      stampTexture: this.stampTexture,
      stampOverlay: this.stampOverlay
    };
  }

  createStampCanvas() {
    // Stamping Canvas (Invisible)
    this.stampCanvas = document.createElement('canvas');
    this.stampCanvas.width = 2048;
    this.stampCanvas.height = 2048;
    this.stampCtx = this.stampCanvas.getContext('2d', { willReadFrequently: true, alpha: true });
    this.stampCtx.fillStyle = 'rgba(0, 0, 0, 0)';
    this.stampCtx.fillRect(0, 0, 2048, 2048);

    this.stampTexture = new THREE.CanvasTexture(this.stampCanvas);
    this.stampTexture.wrapS = THREE.ClampToEdgeWrapping;
    this.stampTexture.wrapT = THREE.ClampToEdgeWrapping;
    this.stampTexture.minFilter = THREE.LinearFilter;
    this.stampTexture.magFilter = THREE.LinearFilter;
  }

  createStampOverlay() {
    // Stamp overlay (invisible by default - stamps captured to texture only)
    this.stampOverlay = new THREE.Mesh(
      new THREE.PlaneGeometry(this.CFG.PLANE_SIZE, this.CFG.PLANE_SIZE),
      new THREE.MeshBasicMaterial({
        map: this.stampTexture,
        color: 0xffffff,
        transparent: true,
        opacity: 0.8,
        side: THREE.FrontSide,
        depthWrite: false,
        blending: THREE.AdditiveBlending
      })
    );
    this.stampOverlay.rotation.x = -Math.PI / 2;
    this.stampOverlay.position.y = 0.01;
    this.stampOverlay.receiveShadow = false;
    this.stampOverlay.castShadow = false;
    this.stampOverlay.visible = false;
    this.scene.add(this.stampOverlay);
  }

  // Stamp intersection on ground
  stampIntersection(now, lastOBB, contactSamples, contactResult, pipManager, velocity, normalForce, angularVelocity = null) {
    if (!this.enableStamping || now - this.lastStampTime < this.stampInterval || !lastOBB || contactSamples.length === 0) {
      return;
    }

    this.lastStampTime = now;
    
    const intersectionCanvas = document.getElementById('pip3Canvas');
    if (!intersectionCanvas) return;

    // Check if there's content to stamp
    const tempCtx = intersectionCanvas.getContext('2d');
    const checkData = tempCtx.getImageData(130 - 50, 130 - 50, 100, 100);
    let hasContent = false;
    for (let i = 0; i < checkData.data.length; i += 4) {
      if (checkData.data[i] > 30 || checkData.data[i+1] > 30 || checkData.data[i+2] > 30) {
        hasContent = true;
        break;
      }
    }
    
    if (!hasContent) return;

    // Choose stamp position: bounding box center or geometric center of contacts
    let stampWorldX, stampWorldZ;
    if (this.useBBoxCenter) {
      // Use bounding box center
      stampWorldX = lastOBB.center.x;
      stampWorldZ = lastOBB.center.z;
    } else {
      // Use geometric center of contact points (default)
      stampWorldX = contactResult.geometricCenter.x;
      stampWorldZ = contactResult.geometricCenter.z;
    }
    
    // Convert to canvas coordinates (top-down view)
    const canvasX = ((stampWorldX + this.CFG.PLANE_SIZE / 2) / this.CFG.PLANE_SIZE) * this.stampCanvas.width;
    const canvasY = ((stampWorldZ + this.CFG.PLANE_SIZE / 2) / this.CFG.PLANE_SIZE) * this.stampCanvas.height;
    
    // Calculate stamp size constrained to bbox dimensions
    // Use actual OBB width and height to match the rectangular bounding box shape
    const paddedWidth = lastOBB.width;
    const paddedHeight = lastOBB.height;
    // Convert world-space dimensions to canvas pixels
    const stampWidth = paddedWidth / this.CFG.PLANE_SIZE * this.stampCanvas.width;
    const stampHeight = paddedHeight / this.CFG.PLANE_SIZE * this.stampCanvas.height;

    // Calculate world-space rotation angle
    // Combine OBB angle with angular velocity for dynamic rotation
    let worldRotation = lastOBB.theta || 0;
    if (angularVelocity && angularVelocity.y !== undefined) {
      // Add angular velocity contribution (Y component = yaw around vertical axis)
      const angularDamping = 0.01; // Damping to prevent over-rotation
      worldRotation += angularVelocity.y * angularDamping;
    }

    // Apply stamp with proper world-space rotation
    this.stampCtx.save();
    this.stampCtx.translate(canvasX, canvasY);

    // Apply world-space rotation (positive to match world coordinate system)
    this.stampCtx.rotate(worldRotation);

    // Flip for proper UV orientation (both axes flipped for correct alignment)
    this.stampCtx.scale(-1, -1);

    this.stampCtx.globalAlpha = 1.0;
    this.stampCtx.globalCompositeOperation = 'source-over';

    // Draw either line stencil or complete intersection based on checkbox
    if (this.stampLineStencil && pipManager && pipManager.pip4) {
      // Get OBB angle for stencil rotation
      const obbAngle = lastOBB && lastOBB.theta !== undefined ? lastOBB.theta : null;

      // Force update the stencil with current parameters, velocity, normal force, OBB angle, and angular velocity before stamping
      pipManager.pip4.forceUpdate(velocity, normalForce, this.lineIntensityScale, obbAngle, angularVelocity);

      // Use line stencil from PiP4
      const lineStencilCanvas = pipManager.pip4.getStencilCanvas();
      if (lineStencilCanvas) {
        // Draw with actual OBB dimensions (rectangular, not square)
        this.stampCtx.drawImage(
          lineStencilCanvas,
          -stampWidth / 2,
          -stampHeight / 2,
          stampWidth,
          stampHeight
        );
      }
    } else {
      // Use complete intersection (original behavior) with OBB dimensions
      this.stampCtx.drawImage(
        intersectionCanvas,
        -stampWidth / 2,
        -stampHeight / 2,
        stampWidth,
        stampHeight
      );
    }

    this.stampCtx.restore();
    this.stampTexture.needsUpdate = true;
  }

  // Clear stamps
  clearStamps() {
    this.stampCtx.clearRect(0, 0, this.stampCanvas.width, this.stampCanvas.height);
    this.stampTexture.needsUpdate = true;
  }

  // Save stamps as PNG
  saveStamps() {
    saveCanvasAsPNG(this.stampCanvas, 'stamps.png');
  }

  // Toggle stamping
  toggleStamping(enable) {
    this.enableStamping = enable;
  }

  // Toggle line stencil
  toggleLineStencil(enable) {
    this.stampLineStencil = enable;
  }

  // Toggle stamp visibility
  toggleStampVisibility(show) {
    this.showStamps = show;
    if (this.stampOverlay) {
      this.stampOverlay.visible = show;
    }
  }

  // Toggle bounding box center usage
  toggleUseBBoxCenter(use) {
    this.useBBoxCenter = use;
  }

  // Set stamp interval
  setStampInterval(interval) {
    this.stampInterval = interval;
  }

  // Set line intensity scale
  setLineIntensityScale(scale) {
    this.lineIntensityScale = scale;
  }

  // Get stamp canvas reference
  getStampCanvas() {
    return this.stampCanvas;
  }

  // Get stamp texture reference
  getStampTexture() {
    return this.stampTexture;
  }

  // Get stamp overlay reference
  getStampOverlay() {
    return this.stampOverlay;
  }

  // Get configuration
  getConfig() {
    return {
      enableStamping: this.enableStamping,
      stampLineStencil: this.stampLineStencil,
      showStamps: this.showStamps,
      useBBoxCenter: this.useBBoxCenter,
      lineIntensityScale: this.lineIntensityScale,
      stampInterval: this.stampInterval
    };
  }

  // Cleanup method
  dispose() {
    if (this.stampOverlay) {
      this.scene.remove(this.stampOverlay);
      this.stampOverlay = null;
    }
    
    this.stampCanvas = null;
    this.stampCtx = null;
    this.stampTexture = null;
  }
}
