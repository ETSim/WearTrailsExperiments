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
    this.setupExportControls();
    // Wall stamping controls removed - functionality eliminated
    // this.setupWallStampingControls();
  }
  
  setupSimulationControls() {
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
        window.timestepHz = parseInt(e.target.value);
        document.getElementById('timestepVal').textContent = window.timestepHz;
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
        document.getElementById('fixedTimestepVal').textContent = window.fixedTimestep;
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
    
    const clearPiP4StencilEl = document.getElementById('clearPiP4Stencil');
    if (clearPiP4StencilEl) {
      clearPiP4StencilEl.onclick = () => {
        if (window.pipManager && window.pipManager.pip4) {
          window.pipManager.pip4.clearStencil();
        }
      };
    }
    
    // Line stencil controls
    const lineSpacingEl = document.getElementById('lineSpacing');
    if (lineSpacingEl) {
      lineSpacingEl.oninput = (e) => {
        const spacing = parseInt(e.target.value);
        document.getElementById('lineSpacingVal').textContent = spacing + ' px';
        if (window.pipManager && window.pipManager.pip4) {
          window.pipManager.pip4.setLineSpacing(spacing);
        }
      };
    }
    
    const lineWidthEl = document.getElementById('lineWidth');
    if (lineWidthEl) {
      lineWidthEl.oninput = (e) => {
        const width = parseInt(e.target.value);
        document.getElementById('lineWidthVal').textContent = width + ' px';
        if (window.pipManager && window.pipManager.pip4) {
          window.pipManager.pip4.setLineWidth(width);
        }
      };
    }
    
    const lineIntensityEl = document.getElementById('lineIntensity');
    if (lineIntensityEl) {
      lineIntensityEl.oninput = (e) => {
        const intensity = parseInt(e.target.value);
        window.state.lineIntensityScale = intensity / 100;
        document.getElementById('lineIntensityVal').textContent = intensity + '%';
      };
    }
    
    const useCustomPatternEl = document.getElementById('useCustomPattern');
    if (useCustomPatternEl) {
      useCustomPatternEl.onchange = (e) => {
        window.state.useCustomPattern = e.target.checked;
        if (window.pipManager && window.pipManager.pip4) {
          window.pipManager.pip4.setUseCustomPattern(window.state.useCustomPattern);
        }
      };
    }

    const selectPatternEl = document.getElementById('selectPattern');
    if (selectPatternEl) {
      selectPatternEl.onclick = () => {
        document.getElementById('patternFile').click();
      };
    }

    const patternFileEl = document.getElementById('patternFile');
    if (patternFileEl) {
      patternFileEl.onchange = async (e) => {
        if (e.target.files && e.target.files[0]) {
          try {
            if (window.pipManager && window.pipManager.pip4) {
              await window.pipManager.pip4.loadCustomPattern(e.target.files[0]);
              window.state.useCustomPattern = true;
              document.getElementById('useCustomPattern').checked = true;
              window.pipManager.pip4.setUseCustomPattern(true);
              console.log('Custom pattern loaded successfully');
            }
          } catch (error) {
            console.error('Failed to load custom pattern:', error);
            alert('Failed to load custom pattern. Please make sure it\'s a valid PNG file.');
          }
        }
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
  }

  setupPiPControls() {
    const showPiP4El = document.getElementById('showPiP4');
    if (showPiP4El) {
      showPiP4El.onchange = (e) => {
        window.state.showPiP4 = e.target.checked;
      };
    }
  }
  
  setupExportControls() {
    // Check if export elements exist before adding event listeners
    const exportPiP1El = document.getElementById('exportPiP1');
    const exportPiP2El = document.getElementById('exportPiP2');
    const exportPiP3El = document.getElementById('exportPiP3');
    const exportPiP4El = document.getElementById('exportPiP4');
    const saveIntersectionEl = document.getElementById('saveIntersection');
    
    if (exportPiP1El) exportPiP1El.addEventListener('click', this.exportPiP1);
    if (exportPiP2El) exportPiP2El.addEventListener('click', this.exportPiP2);
    if (exportPiP3El) exportPiP3El.addEventListener('click', this.exportPiP3);
    if (exportPiP4El) exportPiP4El.addEventListener('click', this.exportPiP4);
    if (saveIntersectionEl) saveIntersectionEl.addEventListener('click', this.exportAllPiPViews);
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
      'fieldIntensityDetails', 'flowMapDetails', 'exportDetails'
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
  
  // Export functions
  exportPiP1() {
    if (window.pipManager && window.pipManager.pip1) {
      this.saveCanvasAsPNG(window.pipManager.pip1.canvas, 'pip1_top_view.png');
    }
  }
  
  exportPiP2() {
    if (window.pipManager && window.pipManager.pip2) {
      this.saveCanvasAsPNG(window.pipManager.pip2.canvas, 'pip2_bottom_view.png');
    }
  }
  
  exportPiP3() {
    if (window.pipManager && window.pipManager.pip3) {
      this.saveCanvasAsPNG(window.pipManager.pip3.canvas, 'pip3_intersection.png');
    }
  }
  
  exportPiP4() {
    if (window.pipManager && window.pipManager.pip4) {
      this.saveCanvasAsPNG(window.pipManager.pip4.canvas, 'pip4_line_stencil.png');
    }
  }
  
  exportAllPiPViews() {
    this.exportPiP1();
    this.exportPiP2();
    this.exportPiP3();
    this.exportPiP4();
  }
  
  saveCanvasAsPNG(canvas, filename) {
    const link = document.createElement('a');
    link.download = filename;
    link.href = canvas.toDataURL();
    link.click();
  }
}
