// PiP 1 - Top View (+n direction)

export class PiP1 {
  constructor(pipRenderer) {
    this.pipRenderer = pipRenderer;
    this.camera = pipRenderer.createOrthographicCamera();
    this.renderTarget = pipRenderer.createRenderTarget();
    this.canvasCtx = document.getElementById('pip1Canvas').getContext('2d', { willReadFrequently: true });
  }
  
  update(lastOBB, paddingWidthScale, paddingHeightScale, paddingDepthTopScale, rotationAngle = null) {
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
    const d = Math.max(1.0, this.pipRenderer.CFG.OBB_DEPTH * paddingDepthTopScale);
    
    this.pipRenderer.updateCamera(this.camera, center, n, e1, w, h, d, 1);
  }
  
  render() {
    return this.pipRenderer.renderToCanvas(this.renderTarget, this.camera, this.canvasCtx);
  }
  
  clear() {
    this.canvasCtx.clearRect(0, 0, this.pipRenderer.CFG.PIP_W, this.pipRenderer.CFG.PIP_H);
  }
}
