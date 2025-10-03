// PiP Module - Picture-in-Picture views

import { PiPRenderer } from './pip-base.js';
import { PiP1 } from './pip1.js';
import { PiP2 } from './pip2.js';
import { PiP3 } from './pip3.js';
import { PiP4 } from './pip4.js';

export class PiPManager {
  constructor(CFG, THREE, renderer, scene) {
    const pipRenderer = new PiPRenderer(CFG, THREE, renderer, scene);
    
    this.pip1 = new PiP1(pipRenderer);
    this.pip2 = new PiP2(pipRenderer);
    this.pip3 = new PiP3(pipRenderer);
    this.pip4 = new PiP4(pipRenderer);
    
    this.renderer = renderer;
  }
  
  renderAll(pipEnabled, lastOBB, paddingWidthScale, paddingHeightScale, paddingDepthTopScale, paddingDepthBottomScale, fieldFlowCanvases, rotationAngle = null, showPiP4 = true, velocity = null, normalForce = 1.0, intensityScale = 1.0, angularVelocity = null) {
    if (!pipEnabled || !lastOBB) {
      this.pip1.clear();
      this.pip2.clear();
      this.pip3.clear();
      this.pip4.clear();
      return null;
    }

    // Update camera positions with rotation angle (rotates the camera views based on velocity)
    this.pip1.update(lastOBB, paddingWidthScale, paddingHeightScale, paddingDepthTopScale, rotationAngle);
    this.pip2.update(lastOBB, paddingWidthScale, paddingHeightScale, paddingDepthBottomScale, rotationAngle);

    // Render views
    const pixels1 = this.pip1.render();
    const pixels2 = this.pip2.render();

    // Render intersection (no rotation needed - cameras are already rotated)
    this.pip3.render(pixels1, pixels2);

    // Update PiP4 stencil with intersection data if enabled
    if (showPiP4) {
      const intersectionData = this.pip3.canvasCtx.getImageData(0, 0, this.pip1.pipRenderer.CFG.PIP_W, this.pip1.pipRenderer.CFG.PIP_H);
      // Pass OBB angle (theta) and angular velocity to the stencil for proper rotation
      const obbAngle = lastOBB && lastOBB.theta !== undefined ? lastOBB.theta : null;
      this.pip4.updateStencil(intersectionData, velocity, normalForce, intensityScale, obbAngle, angularVelocity);
      this.pip4.render();
    } else {
      this.pip4.clear();
    }

    // Reset render target
    this.renderer.setRenderTarget(null);

    // Return intersection image data for field/flow processing
    return this.pip3.canvasCtx.getImageData(0, 0, this.pip1.pipRenderer.CFG.PIP_W, this.pip1.pipRenderer.CFG.PIP_H);
  }
}
