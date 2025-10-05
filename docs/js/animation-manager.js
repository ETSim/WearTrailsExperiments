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

    window.state.contactSamples = newContactResult.contactSamples;
    this.contactResult.count = newContactResult.count;
    this.contactResult.filteredCount = newContactResult.filteredCount;
    this.contactResult.realContactCount = newContactResult.realContactCount;
    this.contactResult.syntheticCount = newContactResult.syntheticCount;
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

      // Add tooltip with debug info including synthetic count
      const reasons = newContactResult.flags.reasons.join(', ');
      const syntheticInfo = newContactResult.syntheticCount > 0
        ? `\nReal: ${newContactResult.realContactCount}, Synthetic: ${newContactResult.syntheticCount}`
        : '';
      contactsEl.title = `Raw: ${newContactResult.rawCount}, Filtered: ${newContactResult.filteredCount}${syntheticInfo}${reasons ? '\nReasons: ' + reasons : ''}`;
    }

    // Update separate real/synthetic contact counts in UI
    const realContactsEl = document.getElementById('realContacts');
    const syntheticContactsEl = document.getElementById('syntheticContacts');

    if (realContactsEl) {
      realContactsEl.textContent = String(newContactResult.realContactCount || 0);
    }

    if (syntheticContactsEl) {
      syntheticContactsEl.textContent = String(newContactResult.syntheticCount || 0);
      // Style differently if synthetic contacts are present
      if (newContactResult.syntheticCount > 0) {
        syntheticContactsEl.style.fontWeight = 'bold';
      } else {
        syntheticContactsEl.style.fontWeight = 'normal';
      }
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
    }
  }
  
  updateVisualization() {
    // Use visualization manager instead of global functions
    this.visualizationManager.updateContacts(
      window.state.contactSamples,
      window.state.showContacts
    );
    this.visualizationManager.updateGeomCenter(
      this.contactResult.filteredCount > 0 ? this.contactResult.geometricCenter : null,
      window.state.showGeomCenter
    );
  }
  
  computeBoundingBox(dynBody, dynMesh) {
    if (dynMesh && window.state.contactSamples.length > 0) {
      const isSoftBody = dynMesh.userData.isSoftBody || false;
      const obb = window.computeBoundingBox(
        window.state.contactSamples,
        this.contactResult.avgContactPoint,
        this.contactResult.avgContactNormal,
        window.state.bboxAlgorithm,
        window.CFG,
        window.THREE,
        dynBody,
        window.A,
        window.state.lastOBB,
        window.state.previousVelocity,
        window.state.previousAngle,
        window.ANGLE_STABILITY_THRESHOLD,
        isSoftBody
      );

      if (obb) {
        window.state.lastOBB = obb;
        // Use visualization manager instead of global function
        this.visualizationManager.updateOBB(
          obb,
          window.state.paddingWidthScale,
          window.state.paddingHeightScale,
          window.state.paddingDepthTopScale,
          window.state.paddingDepthBottomScale
        );
        const angDeg = (obb.theta * 180 / Math.PI).toFixed(2);
        document.getElementById('obbAng').textContent = angDeg + '°';
      }
    } else {
      window.state.lastOBB = null;
      // Hide OBB through visualization manager
      this.visualizationManager.toggleOBB(false);
      document.getElementById('obbAng').textContent = '—';
    }
  }
  
  renderPiPViews(now, dynBody, dynMesh) {
    // Calculate rotation angle from velocity for PiP camera orientation
    let cameraRotation = null;
    if (dynBody && window.state.lastOBB) {
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
      window.state.pipEnabled,
      window.state.lastOBB,
      window.state.paddingWidthScale,
      window.state.paddingHeightScale,
      window.state.paddingDepthTopScale,
      window.state.paddingDepthBottomScale,
      window.fieldFlowCanvases,
      cameraRotation,
      window.state.showPiP4,
      velocity,
      window.normalForce,
      window.state.lineIntensityScale,
      angularVelocity
    );

    return intersectionData;
  }

  handleStamping(now, dynBody, dynMesh) {
    if (window.state.enableStamping && window.state.lastOBB && now - this.lastStampTime > window.state.stampInterval) {
      this.lastStampTime = now;
      
      // Calculate stamp position
      let stampWorldX, stampWorldZ;

      if (window.state.useBBoxCenter) {
        // Use actual 3D bounding box center (from mesh/body)
        if (dynMesh) {
          // Calculate 3D bounding box center from mesh
          const box = new window.THREE.Box3().setFromObject(dynMesh);
          const center = new window.THREE.Vector3();
          box.getCenter(center);
          stampWorldX = center.x;
          stampWorldZ = center.z;
        } else {
          // Fallback to OBB center if no mesh
          stampWorldX = window.state.lastOBB.center.x;
          stampWorldZ = window.state.lastOBB.center.z;
        }
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
        window.state.lastOBB,
        window.state.contactSamples,
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
