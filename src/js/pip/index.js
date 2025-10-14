// PiP Module - Picture-in-Picture views

import { PiPRenderer } from './pip-base.js';
import { PiP1 } from './pip1.js';
import { PiP2 } from './pip2.js';
import { PiP3 } from './pip3.js';
import { PiP4 } from './pip4.js';
import { PiP5 } from './pip5.js';
import { PiP7 } from './pip7.js';
import { PiP8 } from './pip8.js';
import { PiP6 } from './pip6.js';

export class PiPManager {
  constructor(CFG, THREE, renderer, scene) {
    const pipRenderer = new PiPRenderer(CFG, THREE, renderer, scene);

    this.pip1 = new PiP1(pipRenderer);
    this.pip2 = new PiP2(pipRenderer);
    this.pip3 = new PiP3(pipRenderer);
    this.pip4 = new PiP4(pipRenderer);
    this.pip5 = new PiP5(pipRenderer);
    this.pip6 = new PiP6(pipRenderer);
    this.pip7 = new PiP7(pipRenderer);
    this.pip8 = new PiP8(pipRenderer);

    this.renderer = renderer;
  }

  renderAll(pipEnabled, lastOBB, paddingWidthScale, paddingHeightScale, paddingDepthTopScale, paddingDepthBottomScale, rotationAngle = null, velocity = null, angularVelocity = null, normalForce = null, timestep = 0.001, slidingDistanceManager = null) {
    if (!pipEnabled || !lastOBB) {
      this.pip1.clear();
      this.pip2.clear();
      this.pip3.clear();
      this.pip4.clear();
      this.pip5.clear();
      this.pip6.clear();
      this.pip7.clear();
      this.pip8.clear();
      return;
    }

    // Update camera positions with rotation angle (rotates the camera views based on velocity)
    this.pip1.update(lastOBB, paddingWidthScale, paddingHeightScale, paddingDepthTopScale, rotationAngle);
    this.pip2.update(lastOBB, paddingWidthScale, paddingHeightScale, paddingDepthBottomScale, rotationAngle);

    // Render views
    const pixels1 = this.pip1.render();
    const pixels2 = this.pip2.render();

    // Render intersection (no rotation needed - cameras are already rotated)
    this.pip3.render(pixels1, pixels2);

    // Render tangential velocity vector field
    this.pip4.render(pixels1, pixels2, velocity, angularVelocity, lastOBB);

    // Render instant tangential traction (unified pressure model)
    this.pip5.render(pixels1, pixels2, velocity, angularVelocity, normalForce, lastOBB);

    // Render accumulated sliding distance from ground canvas (PiP6)
    const timestepEstimate = window.state ? (window.state.stampInterval / 1000) : 0.001;
    this.pip6.render(pixels1, pixels2, velocity, angularVelocity, normalForce, lastOBB, timestepEstimate, slidingDistanceManager);

    // Render PiP7 (local sliding distance with direction)
    this.pip7.render(pixels1, pixels2, velocity, angularVelocity, lastOBB, timestep);

    // Render PiP8 (local wear map: pressure × friction × velocity)
    this.pip8.render(pixels1, pixels2, velocity, angularVelocity, normalForce, lastOBB);

    // Reset render target
    this.renderer.setRenderTarget(null);
  }
}
