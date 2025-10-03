// Simplified UV Painting System
// Backs stamp changes directly into ground UV texture

export class UVPaintSystem {
  constructor(THREE) {
    this.THREE = THREE;
    this.groundUVCanvas = null;
    this.groundUVContext = null;
    this.groundUVTexture = null;
    this.isEnabled = false;
    this.groundMesh = null;
    this.originalGroundTexture = null;
  }
  
  // Initialize the ground UV canvas
  init(groundMesh, width = 2048, height = 2048) {
    this.groundMesh = groundMesh;
    if (!groundMesh || !groundMesh.material) return;
    
    // Store original ground texture
    this.originalGroundTexture = groundMesh.material.map;
    
    // Create ground UV canvas
    this.groundUVCanvas = document.createElement('canvas');
    this.groundUVCanvas.width = width;
    this.groundUVCanvas.height = height;
    this.groundUVContext = this.groundUVCanvas.getContext('2d');
    
    // Copy original ground texture to canvas
    if (this.originalGroundTexture && this.originalGroundTexture.image) {
      this.groundUVContext.drawImage(this.originalGroundTexture.image, 0, 0, width, height);
    } else {
      // Fill with white if no original texture
      this.groundUVContext.fillStyle = '#ffffff';
      this.groundUVContext.fillRect(0, 0, width, height);
    }
    
    // Create new UV texture
    this.groundUVTexture = new this.THREE.CanvasTexture(this.groundUVCanvas);
    this.groundUVTexture.wrapS = this.THREE.RepeatWrapping;
    this.groundUVTexture.wrapT = this.THREE.RepeatWrapping;
    this.groundUVTexture.repeat.set(2, 2); // Match original ground texture repeat
    this.groundUVTexture.needsUpdate = true;
    
    // Apply to ground material
    groundMesh.material.map = this.groundUVTexture;
    groundMesh.material.needsUpdate = true;
    
    return this.groundUVCanvas;
  }
  
  // Paint stamp to ground UV coordinates
  paintStampToGroundUV(stampCanvas, worldX, worldZ, stampSize, planeSize) {
    if (!this.groundUVContext || !this.isEnabled) return;
    
    // Convert world coordinates to UV coordinates (0-1 range)
    const uvU = (worldX + planeSize / 2) / planeSize;
    const uvV = (worldZ + planeSize / 2) / planeSize;
    
    // Convert UV to canvas coordinates
    const canvasX = uvU * this.groundUVCanvas.width;
    const canvasY = (1 - uvV) * this.groundUVCanvas.height; // Flip V coordinate
    
    // Calculate stamp size in canvas coordinates
    const canvasStampSize = (stampSize / planeSize) * this.groundUVCanvas.width;
    
    // Paint the stamp to the ground UV canvas
    this.groundUVContext.save();
    this.groundUVContext.globalAlpha = 0.8; // Moderate opacity for blending
    this.groundUVContext.globalCompositeOperation = 'multiply'; // Darken blend mode
    this.groundUVContext.drawImage(
      stampCanvas,
      canvasX - canvasStampSize / 2,
      canvasY - canvasStampSize / 2,
      canvasStampSize,
      canvasStampSize
    );
    this.groundUVContext.restore();
    
    // Update the texture
    if (this.groundUVTexture) {
      this.groundUVTexture.needsUpdate = true;
    }
  }
  
  // Enable/disable UV painting
  setEnabled(enabled) {
    this.isEnabled = enabled;
  }
  
  // Clear the ground UV paint
  clearPaint() {
    if (!this.groundUVContext) return;
    
    // Restore original ground texture
    if (this.originalGroundTexture && this.originalGroundTexture.image) {
      this.groundUVContext.drawImage(
        this.originalGroundTexture.image, 
        0, 0, 
        this.groundUVCanvas.width, 
        this.groundUVCanvas.height
      );
    } else {
      // Fill with white if no original texture
      this.groundUVContext.fillStyle = '#ffffff';
      this.groundUVContext.fillRect(0, 0, this.groundUVCanvas.width, this.groundUVCanvas.height);
    }
    
    if (this.groundUVTexture) {
      this.groundUVTexture.needsUpdate = true;
    }
  }
  
  // Get ground UV canvas for saving
  getGroundUVCanvas() {
    return this.groundUVCanvas;
  }
  
  // Dispose resources
  dispose() {
    if (this.groundUVTexture) {
      this.groundUVTexture.dispose();
    }
    
    // Restore original ground texture if needed
    if (this.groundMesh && this.groundMesh.material && this.originalGroundTexture) {
      this.groundMesh.material.map = this.originalGroundTexture;
      this.groundMesh.material.needsUpdate = true;
    }
    
    this.groundUVCanvas = null;
    this.groundUVContext = null;
    this.groundUVTexture = null;
    this.groundMesh = null;
    this.originalGroundTexture = null;
  }
}