// Base PiP rendering functionality

export class PiPRenderer {
  constructor(CFG, THREE, renderer, scene) {
    this.CFG = CFG;
    this.THREE = THREE;
    this.renderer = renderer;
    this.scene = scene;
  }
  
  createOrthographicCamera() {
    return new this.THREE.OrthographicCamera(-1, 1, 1, -1, 0.01, 200);
  }
  
  createRenderTarget() {
    return new this.THREE.WebGLRenderTarget(this.CFG.PIP_W, this.CFG.PIP_H);
  }
  
  renderToCanvas(renderTarget, camera, canvasCtx) {
    // Temporarily hide overlay/canvas-texture meshes (e.g., stamp and field/flow layers)
    const hidden = [];
    this.scene.traverse((obj) => {
      if (obj && obj.userData && obj.userData.pipHidden === true && obj.visible) {
        hidden.push(obj);
        obj.visible = false;
      }
    });

    this.renderer.setRenderTarget(renderTarget);
    this.renderer.render(this.scene, camera);
    
    const pixels = new Uint8Array(this.CFG.PIP_W * this.CFG.PIP_H * 4);
    this.renderer.readRenderTargetPixels(renderTarget, 0, 0, this.CFG.PIP_W, this.CFG.PIP_H, pixels);
    const imageData = new ImageData(new Uint8ClampedArray(pixels), this.CFG.PIP_W, this.CFG.PIP_H);
    canvasCtx.putImageData(imageData, 0, 0);

    // Restore visibility
    for (const obj of hidden) obj.visible = true;
    
    return pixels;
  }
  
  updateCamera(camera, center, n, e1, w, h, d, direction = 1) {
    // Position camera exactly at the edge of the 3D bounding box based on padding
    // The camera should be positioned at the surface of the padded bounding box
    const cameraDistance = d * 0.5; // Position exactly at the box boundary
    
    const pos = center.clone().addScaledVector(n, cameraDistance * direction);
    camera.position.copy(pos);
    camera.up.copy(e1);
    
    // Set orthographic bounds to exactly match the padded 3D bounding box
    // No additional margins - the view should stop exactly at the box bounds
    camera.left = -w * 0.5;
    camera.right = w * 0.5;
    camera.top = h * 0.5;
    camera.bottom = -h * 0.5;
    
    // Calculate precise near and far planes based on the 3D box depth and padding
    // Near plane: Just at the camera position (box surface)
    camera.near = 0.01; // Very close to camera position
    
    // Far plane: Exactly at the opposite face of the 3D bounding box
    // This ensures the view stops precisely at the padded box bounds
    camera.far = d; // Full depth of the padded bounding box
    
    camera.lookAt(center);
    camera.updateProjectionMatrix();
  }
}
