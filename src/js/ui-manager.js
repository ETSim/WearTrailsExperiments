// UI Manager Module
// Handles all UI interactions and event listeners

export class UIManager {
  constructor() {
    this.initializeEventListeners();
    this.initializeCollapsibleSections();
  }
  
  initializeEventListeners() {
    // Simulation controls
    this.setupSimulationControls();
    this.setupPhysicsControls();
    this.setupStampingControls();
    this.setupPiPControls();
    this.setupContactFilterControls();
    // Wall stamping controls removed - functionality eliminated
    // this.setupWallStampingControls();
  }
  
  setupSimulationControls() {
    // Initialize step counter
    if (!window.stepCounter) {
      window.stepCounter = 0;
    }

    // Start button
    const startEl = document.getElementById('start');
    if (startEl) {
      startEl.onclick = () => {
        window.isPaused = false;
        window.bodyManager.start();
      };
    }

    // Reset button
    const resetEl = document.getElementById('reset');
    if (resetEl) {
      resetEl.onclick = () => {
        window.isPaused = false;
        window.stepCounter = 0;
        this.updateStepCounter();
        window.bodyManager.reset();
      };
    }

    // Pause button
    const pauseEl = document.getElementById('pause');
    if (pauseEl) {
      pauseEl.onclick = () => {
        window.isPaused = !window.isPaused;
      };
    }

    // Step frame button
    const stepFrameEl = document.getElementById('stepFrame');
    if (stepFrameEl) {
      stepFrameEl.onclick = () => {
        window.isPaused = true;
        window.singleStep = true;
        window.stepCounter++;
        this.updateStepCounter();
      };
    }
    
    // Algorithm selection
    const bboxAlgoEl = document.getElementById('bboxAlgo');
    if (bboxAlgoEl) {
      bboxAlgoEl.onchange = (e) => {
        window.bboxAlgorithm = e.target.value;
      };
    }
    
    // Wall obstacle toggle
    const showWallObstacleEl = document.getElementById('showWallObstacle');
    if (showWallObstacleEl) {
      showWallObstacleEl.onchange = (e) => {
        window.showWallObstacle = e.target.checked;
        if (window.wallStampingManager) {
          window.wallStampingManager.updateVisibility(window.showWallObstacle);
        }
        window.stampOverlay.visible = window.showWallObstacle && window.showStamps;
        window.wallStampOverlay.visible = window.showWallObstacle && window.showWallStamps;
      };
    }
  }
  
  setupPhysicsControls() {
    // Padding controls
    const paddingWidthEl = document.getElementById('paddingWidth');
    if (paddingWidthEl) {
      paddingWidthEl.oninput = (e) => {
        window.paddingWidthScale = parseInt(e.target.value) / 100;
        document.getElementById('paddingWidthVal').textContent = window.paddingWidthScale.toFixed(2) + 'x';
      };
    }
    
    const paddingHeightEl = document.getElementById('paddingHeight');
    if (paddingHeightEl) {
      paddingHeightEl.oninput = (e) => {
        window.paddingHeightScale = parseInt(e.target.value) / 100;
        document.getElementById('paddingHeightVal').textContent = window.paddingHeightScale.toFixed(2) + 'x';
      };
    }
    
    const paddingDepthTopEl = document.getElementById('paddingDepthTop');
    if (paddingDepthTopEl) {
      paddingDepthTopEl.oninput = (e) => {
        window.paddingDepthTopScale = parseInt(e.target.value) / 100;
        document.getElementById('paddingDepthTopVal').textContent = window.paddingDepthTopScale.toFixed(2) + 'x';
      };
    }
    
    const paddingDepthBottomEl = document.getElementById('paddingDepthBottom');
    if (paddingDepthBottomEl) {
      paddingDepthBottomEl.oninput = (e) => {
        window.paddingDepthBottomScale = parseInt(e.target.value) / 100;
        document.getElementById('paddingDepthBottomVal').textContent = window.paddingDepthBottomScale.toFixed(2) + 'x';
      };
    }
    
    // Speed controls
    const speedXEl = document.getElementById('speedX');
    if (speedXEl) {
      speedXEl.oninput = (e) => {
        window.bodyManager.speedX = parseFloat(e.target.value);
        document.getElementById('speedXVal').textContent = window.bodyManager.speedX.toFixed(1);
      };
    }
    
    const speedZEl = document.getElementById('speedZ');
    if (speedZEl) {
      speedZEl.oninput = (e) => {
        window.bodyManager.speedZ = parseFloat(e.target.value);
        document.getElementById('speedZVal').textContent = window.bodyManager.speedZ.toFixed(1);
      };
    }
    
    // Force controls
    const forceXEl = document.getElementById('forceX');
    if (forceXEl) {
      forceXEl.oninput = (e) => {
        window.forceX = parseFloat(e.target.value);
        document.getElementById('forceXVal').textContent = window.forceX.toFixed(1);
      };
    }
    
    const forceYEl = document.getElementById('forceY');
    if (forceYEl) {
      forceYEl.oninput = (e) => {
        window.forceY = parseFloat(e.target.value);
        document.getElementById('forceYVal').textContent = window.forceY.toFixed(1);
      };
    }
    
    const forceZEl = document.getElementById('forceZ');
    if (forceZEl) {
      forceZEl.oninput = (e) => {
        window.forceZ = parseFloat(e.target.value);
        document.getElementById('forceZVal').textContent = window.forceZ.toFixed(1);
      };
    }
    
    // Physics parameters
    const gravityEl = document.getElementById('gravity');
    if (gravityEl) {
      gravityEl.oninput = (e) => {
        window.gravity = parseFloat(e.target.value);
        document.getElementById('gravityVal').textContent = window.gravity.toFixed(1);
      };
    }
    
    const frictionEl = document.getElementById('friction');
    if (frictionEl) {
      frictionEl.oninput = (e) => {
        window.friction = parseFloat(e.target.value);
        document.getElementById('frictionVal').textContent = window.friction.toFixed(2);
      };
    }
    
    const restitutionEl = document.getElementById('restitution');
    if (restitutionEl) {
      restitutionEl.oninput = (e) => {
        window.restitution = parseFloat(e.target.value);
        document.getElementById('restitutionVal').textContent = window.restitution.toFixed(2);
      };
    }
    
    const linearDampingEl = document.getElementById('linearDamping');
    if (linearDampingEl) {
      linearDampingEl.oninput = (e) => {
        window.linearDamping = parseFloat(e.target.value);
        document.getElementById('linearDampingVal').textContent = window.linearDamping.toFixed(2);
      };
    }
    
    const angularDampingEl = document.getElementById('angularDamping');
    if (angularDampingEl) {
      angularDampingEl.oninput = (e) => {
        window.angularDamping = parseFloat(e.target.value);
        document.getElementById('angularDampingVal').textContent = window.angularDamping.toFixed(2);
      };
    }
    
    const timestepEl = document.getElementById('timestep');
    if (timestepEl) {
      timestepEl.oninput = (e) => {
        window.state.timestepHz = parseInt(e.target.value);
        document.getElementById('timestepVal').textContent = window.state.timestepHz + ' Hz';
      };
    }
    
    const maxSubstepsEl = document.getElementById('maxSubsteps');
    if (maxSubstepsEl) {
      maxSubstepsEl.oninput = (e) => {
        window.maxSubsteps = parseInt(e.target.value);
        document.getElementById('maxSubstepsVal').textContent = window.maxSubsteps;
      };
    }
    
    const fixedTimestepEl = document.getElementById('fixedTimestep');
    if (fixedTimestepEl) {
      fixedTimestepEl.oninput = (e) => {
        window.fixedTimestep = parseInt(e.target.value);
        document.getElementById('fixedTimestepVal').textContent = window.fixedTimestep + ' Hz';
      };
    }

    // Sub-stepping control
    const subSteppingEl = document.getElementById('subStepping');
    if (subSteppingEl) {
      subSteppingEl.oninput = (e) => {
        window.subStepping = parseInt(e.target.value);
        document.getElementById('subSteppingVal').textContent = window.subStepping;
      };
    }
  }
  
  setupStampingControls() {
    // Ground stamping controls
    const showStampsEl = document.getElementById('showStamps');
    if (showStampsEl) {
      showStampsEl.onchange = (e) => {
        window.showStamps = e.target.checked;
        window.stampOverlay.visible = window.showStamps;
        if (window.wallStampingManager) {
          window.wallStampingManager.updateVisibility(window.showWallObstacle);
        }
      };
    }
    
    const stampLineStencilEl = document.getElementById('stampLineStencil');
    if (stampLineStencilEl) {
      stampLineStencilEl.onchange = (e) => {
        window.stampLineStencil = e.target.checked;
      };
    }
    
    const clearStampsEl = document.getElementById('clearStamps');
    if (clearStampsEl) {
      clearStampsEl.onclick = () => {
        window.stampCtx.clearRect(0, 0, window.stampCanvas.width, window.stampCanvas.height);
        window.stampTexture.needsUpdate = true;
      };
    }
    
    const saveStampsEl = document.getElementById('saveStamps');
    if (saveStampsEl) {
      saveStampsEl.onclick = () => {
        this.saveCanvasAsPNG(window.stampCanvas, 'stamps.png');
      };
    }
    
    
    const stampIntervalEl = document.getElementById('stampInterval');
    if (stampIntervalEl) {
      stampIntervalEl.oninput = (e) => {
        window.state.stampInterval = parseInt(e.target.value);
        document.getElementById('stampIntervalVal').textContent = window.state.stampInterval + ' ms';
      };
    }
    
    const useBBoxCenterEl = document.getElementById('useBBoxCenter');
    if (useBBoxCenterEl) {
      useBBoxCenterEl.onchange = (e) => {
        window.state.useBBoxCenter = e.target.checked;
      };
    }

    const stampLineStencilEl = document.getElementById('stampLineStencil');
    if (stampLineStencilEl) {
      stampLineStencilEl.onchange = (e) => {
        window.state.stampLineStencil = e.target.checked;
      };
    }

    const enableSyntheticEl = document.getElementById('enableSynthetic');
    if (enableSyntheticEl) {
      enableSyntheticEl.onchange = (e) => {
        window.state.enableSynthetic = e.target.checked;
      };
    }
  }

  setupPiPControls() {
    const showPiP4El = document.getElementById('showPiP4');
    if (showPiP4El) {
      showPiP4El.onchange = (e) => {
        window.state.showPiP4 = e.target.checked;
      };
    }
  }
  
  
  setupWallStampingControls() {
    const enableWallStampingEl = document.getElementById('enableWallStamping');
    if (enableWallStampingEl) {
      enableWallStampingEl.onchange = (e) => {
        window.enableWallStamping = e.target.checked;
        if (window.wallStampingManager) {
          window.wallStampingManager.setEnabled(window.enableWallStamping);
        }
      };
    }
    
    const showWallStampsEl = document.getElementById('showWallStamps');
    if (showWallStampsEl) {
      showWallStampsEl.onchange = (e) => {
        window.showWallStamps = e.target.checked;
        if (window.wallStampingManager) {
          window.wallStampingManager.setShowStamps(window.showWallStamps);
        }
      };
    }
    
    const stampWallLineStencilEl = document.getElementById('stampWallLineStencil');
    if (stampWallLineStencilEl) {
      stampWallLineStencilEl.onchange = (e) => {
        window.stampWallLineStencil = e.target.checked;
        if (window.wallStampingManager) {
          window.wallStampingManager.setStampLineStencil(window.stampWallLineStencil);
        }
      };
    }
    
    const clearWallStampsEl = document.getElementById('clearWallStamps');
    if (clearWallStampsEl) {
      clearWallStampsEl.onclick = () => {
        if (window.wallStampingManager) {
          window.wallStampingManager.clearAllStamps();
        }
      };
    }
    
    const saveWallStampsEl = document.getElementById('saveWallStamps');
    if (saveWallStampsEl) {
      saveWallStampsEl.onclick = () => {
        if (window.wallStampingManager) {
          window.wallStampingManager.saveAllStamps();
        }
      };
    }
  }
  
  initializeCollapsibleSections() {
    const collapsibles = document.querySelectorAll('.collapsible');
    collapsibles.forEach(collapsible => {
      collapsible.addEventListener('click', () => {
        const targetId = collapsible.getAttribute('data-target');
        const details = document.getElementById(targetId);
        const icon = collapsible.querySelector('.toggle-icon');

        if (details.style.display === 'none' || details.style.display === '') {
          details.style.display = 'block';
          icon.textContent = '▼';
        } else {
          details.style.display = 'none';
          icon.textContent = '▶';
        }
      });
    });

    // Set specific sections to be closed by default
    const closedSections = [
      'lineStencilDetails', 'combinedDetails', 'physicsSimulationDetails',
      'statsDetails', 'simulationControlsDetails', 'wallStampingDetails',
      'bodyConfigDetails', 'visualizationDetails', 'groundStampingDetails',
      'fieldIntensityDetails', 'flowMapDetails', 'exportDetails',
      // Subsections (all closed by default)
      'paddingControlsDetails', 'speedControlsDetails', 'forceControlsDetails', 'physicsParametersDetails'
    ];

    closedSections.forEach(sectionId => {
      const details = document.getElementById(sectionId);
      const collapsible = document.querySelector(`[data-target="${sectionId}"]`);
      if (details && collapsible) {
        details.style.display = 'none';
        collapsible.querySelector('.toggle-icon').textContent = '▶';
      }
    });
  }

  updateStepCounter() {
    const stepCounterEl = document.getElementById('stepCounter');
    if (stepCounterEl) {
      stepCounterEl.textContent = window.stepCounter || 0;
    }
  }
  
  
  saveCanvasAsPNG(canvas, filename) {
    const link = document.createElement('a');
    link.download = filename;
    link.href = canvas.toDataURL();
    link.click();
  }
}
