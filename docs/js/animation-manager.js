// Animation Manager Module
// Handles the main animation loop and physics updates

import { sampleContacts, ContactParams, ContactState } from '../contacts.js';

export class AnimationManager {
  constructor(scene, camera, renderer, bodyManager, pipManager, visualizationManager, stampingManager, fieldFlowManager) {
    this.scene = scene;
    this.camera = camera;
    this.renderer = renderer;
    this.bodyManager = bodyManager;
    this.pipManager = pipManager;
    this.visualizationManager = visualizationManager;
    this.stampingManager = stampingManager;
    this.fieldFlowManager = fieldFlowManager;

    this.frame = 0;
    this.lastT = performance.now();
    this.lastFrameTime = performance.now();
    this.lastPipRender = 0;
    this.lastStampTime = 0;

    this.contactResult = {
      count: 0,
      geometricCenter: { x: 0, z: 0 },
      avgContactPoint: { x: 0, y: 0, z: 0 },
      avgContactNormal: { x: 0, y: 1, z: 0 }
    };

    // Initialize robust contact acquisition system
    this.contactParams = new ContactParams();
    this.contactState = new ContactState();
  }
  
  start() {
    this.animate();
  }
  
  animate() {
    requestAnimationFrame(() => this.animate());
    this.frame++;
    
    const now = performance.now();
    
    // Update FPS
    if (now - this.lastT > 500) {
      const fps = Math.round(1000 / (now - this.lastT) * this.frame);
      document.getElementById('fps').textContent = String(fps);
      this.lastT = now;
      this.frame = 0;
    }
    document.getElementById('frame').textContent = String(this.frame);
    
    // Get dynamic body reference
    const dynBody = this.bodyManager.getBody();
    const dynMesh = this.bodyManager.getMesh();
    
    // Skip physics if paused
    if (!window.isPaused) {
      this.updatePhysics(now, dynBody, dynMesh);
    }
    
    // Sample contacts
    this.sampleContacts(dynBody, dynMesh);
    
    // Update velocity display
    this.updateVelocityDisplay(dynBody, dynMesh);
    
    // Update visualization
    this.updateVisualization();
    
    // Compute bounding box
    this.computeBoundingBox(dynBody, dynMesh);
    
    // Render main scene
    this.renderer.render(this.scene, this.camera);
    
    // Update scene manager (controls)
    if (window.sceneManager) {
      window.sceneManager.update();
    }
    
    // Render PiP views
    this.renderPiPViews(now, dynBody, dynMesh);
    
    // Handle stamping
    this.handleStamping(now, dynBody, dynMesh);
  }
  
  updatePhysics(now, dynBody, dynMesh) {
    const dt = Math.min(1 / 30, Math.max(1 / 240, (now - this.lastFrameTime) / 1000));
    this.lastFrameTime = now;
    
    if (dynBody && dynMesh) {
      if (dynMesh.userData.isSoftBody) {
        this.updateSoftBodyPhysics(dynBody, dynMesh, dt);
      } else {
        this.updateRigidBodyPhysics(dynBody, dynMesh, dt);
      }
    }
  }
  
  updateSoftBodyPhysics(dynBody, dynMesh, dt) {
    const nodes = dynBody.get_m_nodes();
    const nodeCount = nodes.size();
    
    // Calculate current average velocity
    let avgVx = 0, avgVy = 0, avgVz = 0;
    for (let i = 0; i < nodeCount; i++) {
      const node = nodes.at(i);
      const nodeVel = node.get_m_v();
      avgVx += nodeVel.x();
      avgVy += nodeVel.y();
      avgVz += nodeVel.z();
    }
    avgVx /= nodeCount;
    avgVy /= nodeCount;
    avgVz /= nodeCount;
    
    // Get target speeds
    const targetSpeedX = this.bodyManager.speedX;
    const targetSpeedZ = this.bodyManager.speedZ;
    
    // Calculate velocity corrections needed
    const speedDiffX = targetSpeedX - avgVx;
    const speedDiffZ = targetSpeedZ - avgVz;
    
    // Apply forces to maintain constant speed
    for (let i = 0; i < nodeCount; i++) {
      const node = nodes.at(i);
      const nodePos = node.get_m_x();
      
      // Apply speed correction forces
      const forceX = speedDiffX * 1000; // Proportional gain
      const forceZ = speedDiffZ * 1000;
      
      // Apply external forces
      const totalForceX = forceX + window.forceX;
      const totalForceY = window.forceY;
      const totalForceZ = forceZ + window.forceZ;
      
      node.get_m_f().setX(totalForceX);
      node.get_m_f().setY(totalForceY);
      node.get_m_f().setZ(totalForceZ);
    }
  }
  
  updateRigidBodyPhysics(dynBody, dynMesh, dt) {
    // Apply forces to rigid body
    const totalForceX = window.forceX;
    const totalForceY = window.forceY;
    const totalForceZ = window.forceZ;
    
    if (Math.abs(totalForceX) > 0.1 || Math.abs(totalForceY) > 0.1 || Math.abs(totalForceZ) > 0.1) {
      const force = new A.btVector3(totalForceX, totalForceY, totalForceZ);
      dynBody.applyCentralForce(force);
      A.destroy(force);
    }
    
    // Apply speed control for rigid bodies
    const lv = dynBody.getLinearVelocity();
    const currentSpeedX = lv.x();
    const currentSpeedZ = lv.z();
    const targetSpeedX = this.bodyManager.speedX;
    const targetSpeedZ = this.bodyManager.speedZ;
    
    const speedDiffX = targetSpeedX - currentSpeedX;
    const speedDiffZ = targetSpeedZ - currentSpeedZ;
    
    if (Math.abs(speedDiffX) > 0.1 || Math.abs(speedDiffZ) > 0.1) {
      const speedForce = new A.btVector3(speedDiffX * 1000, 0, speedDiffZ * 1000);
      dynBody.applyCentralForce(speedForce);
      A.destroy(speedForce);
    }
    
    A.destroy(lv);
  }
  
  sampleContacts(dynBody, dynMesh) {
    // Sample contacts with robust acquisition (pass params and state)
    const newContactResult = sampleContacts(
      window.dispatcher,
      window.THREE,
      dynMesh,
      window.MIN_CONTACTS_FOR_STABLE_BOX,
      window.softGroundThreshold,
      this.contactParams,
      this.contactState
    );

    window.contactSamples = newContactResult.contactSamples;
    this.contactResult.count = newContactResult.count;
    this.contactResult.geometricCenter = newContactResult.geometricCenter;
    this.contactResult.avgContactPoint = newContactResult.avgContactPoint;
    this.contactResult.avgContactNormal = newContactResult.avgContactNormal;
    this.contactResult.flags = newContactResult.flags;

    // Update stats with quality indicators
    const contactsEl = document.getElementById('contacts');
    if (contactsEl) {
      let displayText = String(newContactResult.filteredCount);
      if (newContactResult.flags.degraded) displayText += ' ⚠️';
      if (newContactResult.flags.rejected) displayText += ' ❌';
      if (newContactResult.flags.held) displayText += ' 🔒';
      contactsEl.textContent = displayText;

      // Add tooltip with debug info
      const reasons = newContactResult.flags.reasons.join(', ');
      contactsEl.title = `Raw: ${newContactResult.rawCount}, Filtered: ${newContactResult.filteredCount}${reasons ? '\nReasons: ' + reasons : ''}`;
    }

    if (this.contactResult.count > 0) {
      document.getElementById('gcenter').textContent =
        `(${this.contactResult.geometricCenter.x.toFixed(3)}, ${this.contactResult.geometricCenter.z.toFixed(3)})`;
    } else {
      document.getElementById('gcenter').textContent = '—';
    }
  }
  
  updateVelocityDisplay(dynBody, dynMesh) {
    if (this.frame % 10 === 0 && dynBody && dynMesh) {
      let velocityMag = 0;
      if (dynMesh.userData.isSoftBody) {
        // For soft bodies, show average velocity
        const nodes = dynBody.get_m_nodes();
        const nodeCount = nodes.size();
        let avgVx = 0, avgVy = 0, avgVz = 0;
        for (let i = 0; i < nodeCount; i++) {
          const node = nodes.at(i);
          const nodeVel = node.get_m_v();
          avgVx += nodeVel.x();
          avgVy += nodeVel.y();
          avgVz += nodeVel.z();
        }
        avgVx /= nodeCount;
        avgVy /= nodeCount;
        avgVz /= nodeCount;

        const speed = Math.sqrt(avgVx * avgVx + avgVz * avgVz);
        velocityMag = speed;
        document.getElementById('speed').textContent = speed.toFixed(2);
        document.getElementById('velocity').textContent = `(${avgVx.toFixed(1)}, ${avgVy.toFixed(1)}, ${avgVz.toFixed(1)})`;
      } else {
        // For rigid bodies
        const lv = dynBody.getLinearVelocity();
        const speed = Math.sqrt(lv.x() * lv.x() + lv.z() * lv.z());
        velocityMag = speed;
        document.getElementById('speed').textContent = speed.toFixed(2);
        document.getElementById('velocity').textContent = `(${lv.x().toFixed(1)}, ${lv.y().toFixed(1)}, ${lv.z().toFixed(1)})`;
        A.destroy(lv);
      }

      // Update line stencil dynamic values display
      this.updateLineStencilDisplay(velocityMag, dynBody);
    }
  }

  updateLineStencilDisplay(velocityMag, dynBody) {
    // Calculate dynamic values using the same formulas as PiP4
    const baseSpacing = window.pipManager && window.pipManager.pip4 ? window.pipManager.pip4.lineSpacing : 8;
    const baseWidth = window.pipManager && window.pipManager.pip4 ? window.pipManager.pip4.lineWidth : 2;
    const intensityScale = window.lineIntensityScale || 1.0;

    // Calculate normal force
    let normalForce = 1.0;
    if (dynBody) {
      const mass = dynBody.getMass();
      normalForce = mass * window.gravity;
    }

    // Physics-responsive calculations (matching PiP4 logic)
    const normalizedForce = Math.min(normalForce / 30.0, 1.0);
    const velocityFactor = Math.min(velocityMag / 5.0, 1.0);

    // Dynamic spacing
    let dynamicSpacing;
    if (normalizedForce < 0.3 && velocityFactor > 0.5) {
      dynamicSpacing = baseSpacing * (2.0 + velocityFactor * 3.0);
    } else {
      dynamicSpacing = baseSpacing * (1.0 + velocityFactor * 1.0);
    }

    // Dynamic width
    const dynamicWidth = baseWidth * (0.5 + normalizedForce * 2.0);

    // Dynamic intensity
    const baseIntensity = 0.6;
    const forceMultiplier = 0.5 + normalizedForce * 1.5;
    const scaleMultiplier = intensityScale * 2.0;
    const finalIntensity = Math.min(1.0, baseIntensity * forceMultiplier * scaleMultiplier);

    // Update UI displays
    const actualSpacingEl = document.getElementById('actualSpacing');
    if (actualSpacingEl) {
      actualSpacingEl.textContent = dynamicSpacing.toFixed(1) + ' px';
    }

    const actualWidthEl = document.getElementById('actualWidth');
    if (actualWidthEl) {
      actualWidthEl.textContent = dynamicWidth.toFixed(1) + ' px';
    }

    const actualIntensityEl = document.getElementById('actualIntensity');
    if (actualIntensityEl) {
      actualIntensityEl.textContent = Math.round(finalIntensity * 100) + '%';
    }

    const stencilVelocityEl = document.getElementById('stencilVelocity');
    if (stencilVelocityEl) {
      stencilVelocityEl.textContent = velocityMag.toFixed(2) + ' m/s';
    }
  }
  
  updateVisualization() {
    // Use visualization manager instead of global functions
    this.visualizationManager.updateContacts(
      window.contactSamples.slice(0, this.contactResult.count), 
      window.showContacts
    );
    this.visualizationManager.updateGeomCenter(
      this.contactResult.count > 0 ? this.contactResult.geometricCenter : null, 
      window.showGeomCenter
    );
  }
  
  computeBoundingBox(dynBody, dynMesh) {
    if (dynMesh && window.contactSamples.length > 0) {
      const isSoftBody = dynMesh.userData.isSoftBody || false;
      const obb = window.computeBoundingBox(
        window.contactSamples,
        this.contactResult.avgContactPoint,
        this.contactResult.avgContactNormal,
        window.bboxAlgorithm,
        window.CFG,
        window.THREE,
        dynBody,
        window.A,
        window.lastOBB,
        window.previousVelocity,
        window.previousAngle,
        window.ANGLE_STABILITY_THRESHOLD,
        isSoftBody
      );
      
      if (obb) {
        window.lastOBB = obb;
        // Use visualization manager instead of global function
        this.visualizationManager.updateOBB(
          obb, 
          window.paddingWidthScale, 
          window.paddingHeightScale, 
          window.paddingDepthTopScale, 
          window.paddingDepthBottomScale
        );
        const angDeg = (obb.theta * 180 / Math.PI).toFixed(2);
        document.getElementById('obbAng').textContent = angDeg + '°';
      }
    } else {
      window.lastOBB = null;
      // Hide OBB through visualization manager
      this.visualizationManager.toggleOBB(false);
      document.getElementById('obbAng').textContent = '—';
    }
  }
  
  renderPiPViews(now, dynBody, dynMesh) {
    // Calculate rotation angle from velocity for PiP camera orientation
    let cameraRotation = null;
    if (dynBody && window.lastOBB) {
      if (dynMesh && dynMesh.userData.isSoftBody) {
        // For soft bodies, calculate average velocity
        const nodes = dynBody.get_m_nodes();
        const nodeCount = nodes.size();
        let avgVx = 0, avgVz = 0;
        
        for (let i = 0; i < nodeCount; i++) {
          const node = nodes.at(i);
          const nodeVel = node.get_m_v();
          avgVx += nodeVel.x();
          avgVz += nodeVel.z();
        }
        
        if (nodeCount > 0) {
          avgVx /= nodeCount;
          avgVz /= nodeCount;
          const velocityMag = Math.sqrt(avgVx * avgVx + avgVz * avgVz);
          if (velocityMag > 0.5) {
            cameraRotation = Math.atan2(-avgVz, avgVx);
          }
        }
      } else {
        // For rigid bodies
        const lv = dynBody.getLinearVelocity();
        const velocityMag = Math.sqrt(lv.x() * lv.x() + lv.z() * lv.z());
        if (velocityMag > 0.5) {
          // Use velocity direction when moving (invert Z for correct orientation)
          cameraRotation = Math.atan2(-lv.z(), lv.x());
        }
        // If stationary, use null to fall back to OBB's e1
        window.A.destroy(lv);
      }
    }
    
    // Calculate velocity and angular velocity for line angle
    let velocity = null;
    let angularVelocity = null;
    if (dynBody && dynMesh) {
      if (dynMesh.userData.isSoftBody) {
        // For soft bodies, calculate average velocity
        const nodes = dynBody.get_m_nodes();
        const nodeCount = nodes.size();
        let avgVx = 0, avgVz = 0;

        for (let i = 0; i < nodeCount; i++) {
          const node = nodes.at(i);
          const nodeVel = node.get_m_v();
          avgVx += nodeVel.x();
          avgVz += nodeVel.z();
        }

        if (nodeCount > 0) {
          avgVx /= nodeCount;
          avgVz /= nodeCount;
          velocity = { x: avgVx, z: avgVz };
        }

        // Soft bodies don't have direct angular velocity
        angularVelocity = { x: 0, y: 0, z: 0 };
      } else {
        // For rigid bodies - get linear velocity
        const lv = dynBody.getLinearVelocity();
        velocity = { x: lv.x(), z: lv.z() };
        window.A.destroy(lv);

        // Get angular velocity
        const av = dynBody.getAngularVelocity();
        angularVelocity = { x: av.x(), y: av.y(), z: av.z() };
        window.A.destroy(av);
      }
    }
    
    // Render PiP views
    const intersectionData = this.pipManager.renderAll(
      window.pipEnabled,
      window.lastOBB,
      window.paddingWidthScale,
      window.paddingHeightScale,
      window.paddingDepthTopScale,
      window.paddingDepthBottomScale,
      window.fieldFlowCanvases,
      cameraRotation,
      window.showPiP4,
      velocity,
      window.normalForce,
      window.lineIntensityScale,
      angularVelocity
    );
    
    return intersectionData;
  }
  
  handleStamping(now, dynBody, dynMesh) {
    if (window.enableStamping && window.lastOBB && now - this.lastStampTime > window.stampInterval) {
      this.lastStampTime = now;
      
      // Calculate stamp position
      let stampWorldX, stampWorldZ;
      
      if (window.useBBoxCenter) {
        stampWorldX = window.lastOBB.center.x;
        stampWorldZ = window.lastOBB.center.z;
      } else {
        if (this.contactResult.count > 0) {
          stampWorldX = this.contactResult.geometricCenter.x;
          stampWorldZ = this.contactResult.geometricCenter.z;
        } else {
          return; // No contacts to stamp
        }
      }
      
      // Calculate velocity for line angle
      let velocity = null;
      let angularVelocity = null;
      if (dynBody && dynMesh) {
        if (dynMesh.userData.isSoftBody) {
          const nodes = dynBody.get_m_nodes();
          const nodeCount = nodes.size();
          let avgVx = 0, avgVz = 0;

          for (let i = 0; i < nodeCount; i++) {
            const node = nodes.at(i);
            const nodeVel = node.get_m_v();
            avgVx += nodeVel.x();
            avgVz += nodeVel.z();
          }

          if (nodeCount > 0) {
            avgVx /= nodeCount;
            avgVz /= nodeCount;
            velocity = { x: avgVx, z: avgVz };
          }

          // Soft bodies don't have direct angular velocity
          angularVelocity = { x: 0, y: 0, z: 0 };
        } else {
          // Get linear velocity
          const lv = dynBody.getLinearVelocity();
          velocity = { x: lv.x(), z: lv.z() };
          window.A.destroy(lv);

          // Get angular velocity
          const av = dynBody.getAngularVelocity();
          angularVelocity = { x: av.x(), y: av.y(), z: av.z() };
          window.A.destroy(av);
        }
      }
      
      // Calculate normal force
      let normalForce = 1.0;
      if (dynBody) {
        const mass = dynBody.getMass();
        normalForce = mass * window.gravity;
        
        // Add vertical acceleration component
        if (dynMesh.userData.isSoftBody) {
          const nodes = dynBody.get_m_nodes();
          const nodeCount = nodes.size();
          let avgVy = 0;
          for (let i = 0; i < nodeCount; i++) {
            const node = nodes.at(i);
            const nodeVel = node.get_m_v();
            avgVy += nodeVel.y();
          }
          avgVy /= nodeCount;
          normalForce += Math.abs(avgVy) * mass * 0.1; // Damping factor
        }
      }
      
      // Use stamping manager to handle stamping
      this.stampingManager.stampIntersection(
        now,
        window.lastOBB,
        window.contactSamples,
        this.contactResult,
        this.pipManager,
        velocity,
        normalForce,
        angularVelocity
      );
      
      // Use field flow manager to process stamp data
      this.fieldFlowManager.processStamp(stampWorldX, stampWorldZ, velocity, normalForce);
    }
  }
  
}
