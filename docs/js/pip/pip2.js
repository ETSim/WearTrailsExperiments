// PiP 2 - Bottom View (-n direction)

export class PiP2 {
  constructor(pipRenderer) {
    this.pipRenderer = pipRenderer;
    this.camera = pipRenderer.createOrthographicCamera();
    this.renderTarget = pipRenderer.createRenderTarget();
    this.canvasCtx = document.getElementById('pip2Canvas').getContext('2d', { willReadFrequently: true });
  }
  
  update(lastOBB, paddingWidthScale, paddingHeightScale, paddingDepthBottomScale, rotationAngle = null) {
    if (!lastOBB) return null;
    
    const center = new this.pipRenderer.THREE.Vector3(lastOBB.center.x, lastOBB.center.y, lastOBB.center.z);
    const n = new this.pipRenderer.THREE.Vector3(lastOBB.n.x, lastOBB.n.y, lastOBB.n.z).normalize();
    
    // Use custom rotation angle if provided, otherwise use OBB's e1
    let e1;
    if (rotationAngle !== null) {
      // Create e1 perpendicular to velocity direction (add 90° offset)
      // This makes the camera "up" perpendicular to movement direction
      const perpAngle = rotationAngle + Math.PI / 2;
      e1 = new this.pipRenderer.THREE.Vector3(Math.cos(perpAngle), 0, Math.sin(perpAngle)).normalize();
    } else {
      e1 = new this.pipRenderer.THREE.Vector3(lastOBB.e1.x, lastOBB.e1.y, lastOBB.e1.z).normalize();
    }
    
    // Ensure minimum reasonable dimensions for the orthographic view
    const w = Math.max(0.5, lastOBB.width) * paddingWidthScale;
    const h = Math.max(0.5, lastOBB.height) * paddingHeightScale;
    const d = Math.max(1.0, this.pipRenderer.CFG.OBB_DEPTH * paddingDepthBottomScale);

    // Flip Y axis for bottom view by negating e1 (camera up vector)
    const flippedE1 = e1.clone().multiplyScalar(-1);

    this.pipRenderer.updateCamera(this.camera, center, n, flippedE1, w, h, d, -1);
  }
  
  render() {
    // Render to canvas normally
    const pixels = this.pipRenderer.renderToCanvas(this.renderTarget, this.camera, this.canvasCtx);

    // Flip Y axis for bottom view
    // Get current canvas content
    const W = this.pipRenderer.CFG.PIP_W;
    const H = this.pipRenderer.CFG.PIP_H;
    const imageData = this.canvasCtx.getImageData(0, 0, W, H);

    // Create flipped image data
    const flippedData = new ImageData(W, H);

    // Flip vertically: row y becomes row (H-1-y)
    for (let y = 0; y < H; y++) {
      for (let x = 0; x < W; x++) {
        const srcIdx = (y * W + x) * 4;
        const dstY = H - 1 - y;
        const dstIdx = (dstY * W + x) * 4;

        flippedData.data[dstIdx] = imageData.data[srcIdx];
        flippedData.data[dstIdx + 1] = imageData.data[srcIdx + 1];
        flippedData.data[dstIdx + 2] = imageData.data[srcIdx + 2];
        flippedData.data[dstIdx + 3] = imageData.data[srcIdx + 3];
      }
    }

    // Put flipped data back onto canvas
    this.canvasCtx.putImageData(flippedData, 0, 0);

    // Return flipped pixels for intersection calculation
    return flippedData.data;
  }
  
  clear() {
    this.canvasCtx.clearRect(0, 0, this.pipRenderer.CFG.PIP_W, this.pipRenderer.CFG.PIP_H);
  }
}
