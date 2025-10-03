// PiP 4 - Line Stencil View
// Shows a line stencil that only renders on white intersection areas

export class PiP4 {
  constructor(pipRenderer) {
    this.pipRenderer = pipRenderer;
    this.canvasCtx = document.getElementById('pip4Canvas').getContext('2d');
    this.stencilData = null; // Will store the accumulated stencil
    this.stencilCanvas = document.createElement('canvas');
    this.stencilCanvas.width = this.pipRenderer.CFG.PIP_W;
    this.stencilCanvas.height = this.pipRenderer.CFG.PIP_H;
    this.stencilCtx = this.stencilCanvas.getContext('2d');
    
    // Line stencil parameters
    this.lineSpacing = 8;
    this.lineWidth = 2;
    this.lineAngle = 0; // Will be calculated from velocity
    
    // Custom pattern support
    this.useCustomPattern = false;
    this.customPatternImage = null;
    this.customPatternCanvas = null;
    this.customPatternDirection = 0; // Detected direction of the custom pattern
    
    // Initialize with black background
    this.clear();
  }
  
  // Update stencil with new intersection data
  updateStencil(intersectionData, velocity = null, normalForce = 1.0, intensityScale = 1.0, obbAngle = null, angularVelocity = null) {
    const W = this.pipRenderer.CFG.PIP_W;
    const H = this.pipRenderer.CFG.PIP_H;

    // Clear the stencil canvas first
    this.stencilCtx.fillStyle = '#000000';
    this.stencilCtx.fillRect(0, 0, W, H);

    // If no intersection data, create empty mask
    let mask;
    if (!intersectionData) {
      mask = new ImageData(W, H);
      // Fill with transparent (no intersection)
      for (let i = 0; i < mask.data.length; i += 4) {
        mask.data[i] = 0;     // R
        mask.data[i + 1] = 0; // G
        mask.data[i + 2] = 0; // B
        mask.data[i + 3] = 0; // A
      }
    } else {
      // Create a mask from the intersection data (white areas)
      mask = new ImageData(W, H);
      for (let i = 0; i < intersectionData.data.length; i += 4) {
        const r = intersectionData.data[i];
        const g = intersectionData.data[i + 1];
        const b = intersectionData.data[i + 2];

        // Check if this pixel is white (intersection area)
        const isWhite = r > 200 && g > 200 && b > 200;

        if (isWhite) {
          // White intersection area - draw line stencil
          mask.data[i] = 255;     // R
          mask.data[i + 1] = 255; // G
          mask.data[i + 2] = 255; // B
          mask.data[i + 3] = 255; // A
        } else {
          // Non-intersection area - transparent
          mask.data[i] = 0;
          mask.data[i + 1] = 0;
          mask.data[i + 2] = 0;
          mask.data[i + 3] = 0;
        }
      }
    }

    // Calculate velocity magnitude for dynamic spacing
    let velocityMag = 0;
    if (velocity && velocity.x !== undefined && velocity.z !== undefined) {
      velocityMag = Math.sqrt(velocity.x * velocity.x + velocity.z * velocity.z);
    }

    // Calculate line angle - prioritize OBB angle, fallback to velocity
    // Also incorporate angular velocity for dynamic rotation effects
    if (obbAngle !== null) {
      // Use OBB angle directly (convert from radians to degrees)
      this.lineAngle = (obbAngle * 180 / Math.PI);

      // Add angular velocity offset for dynamic rotation
      // Use Y component (yaw) for ground plane rotation with damping factor
      if (angularVelocity && angularVelocity.y !== undefined) {
        const angularDamping = 5.0; // Damping factor to prevent over-rotation
        const angularOffset = (angularVelocity.y * 180 / Math.PI) * angularDamping;
        this.lineAngle += angularOffset;
      }

      // Normalize angle to 0-360 range
      while (this.lineAngle < 0) this.lineAngle += 360;
      while (this.lineAngle >= 360) this.lineAngle -= 360;
    } else if (velocity && velocity.x !== undefined && velocity.z !== undefined) {
      if (velocityMag > 0.1) {
        // Fallback to velocity-based angle if no OBB angle provided
        let velocityAngle = Math.atan2(velocity.z, velocity.x) * (180 / Math.PI);
        this.lineAngle = velocityAngle;

        // Normalize angle to 0-360 range
        while (this.lineAngle < 0) this.lineAngle += 360;
        while (this.lineAngle >= 360) this.lineAngle -= 360;
      }
    }
    
    // Draw the line stencil pattern on white areas only
    this.stencilCtx.save();
    
    // First, create a temporary canvas for the line pattern
    const lineCanvas = document.createElement('canvas');
    lineCanvas.width = W;
    lineCanvas.height = H;
    const lineCtx = lineCanvas.getContext('2d');
    
    // Fill with black background
    lineCtx.fillStyle = '#000000';
    lineCtx.fillRect(0, 0, W, H);
    
    // PHYSICS-RESPONSIVE DYNAMIC PARAMETERS
    // Normal force affects line thickness and intensity
    // Low normal force = thinner, less intense lines
    // High normal force = thicker, more intense lines
    const normalizedForce = Math.min(normalForce / 30.0, 1.0); // Normalize to 0-1 (30N = max)

    // Velocity affects line spacing
    // High velocity = more spaced out lines (motion blur effect)
    // Low velocity = tighter lines (more detail)
    const velocityFactor = Math.min(velocityMag / 5.0, 1.0); // Normalize to 0-1 (5 m/s = max)

    // Dynamic line spacing based on velocity and normal force
    // Low normal force + high velocity = very spaced out lines
    // High normal force + low velocity = tight lines
    let dynamicSpacing;
    if (normalizedForce < 0.3 && velocityFactor > 0.5) {
      // Low force, high velocity: space out significantly
      dynamicSpacing = this.lineSpacing * (2.0 + velocityFactor * 3.0); // 2x to 5x spacing
    } else {
      // Normal behavior: interpolate between base and 2x based on velocity
      dynamicSpacing = this.lineSpacing * (1.0 + velocityFactor * 1.0);
    }

    // Dynamic line width based on normal force
    // Stronger force = thicker lines
    const dynamicLineWidth = this.lineWidth * (0.5 + normalizedForce * 2.0); // 0.5x to 2.5x thickness

    // Enhanced intensity calculation with stronger base intensity
    // Scale up the intensity significantly and apply both force and scale multipliers
    const baseIntensity = 0.6; // Increased base intensity from implicit 0
    const forceMultiplier = 0.5 + normalizedForce * 1.5; // 0.5x to 2x based on force
    const scaleMultiplier = intensityScale * 2.0; // Double the effect of intensity scale
    const finalIntensity = Math.min(1.0, baseIntensity * forceMultiplier * scaleMultiplier);

    if (this.useCustomPattern && this.customPatternImage) {
      // Use custom pattern image
      lineCtx.save();
      lineCtx.globalAlpha = finalIntensity;
      
      // First rotate to 0 degrees (natural orientation), then apply velocity rotation
      lineCtx.translate(W / 2, H / 2);
      
      // Reset to 0 degrees by rotating back by the detected image direction
      lineCtx.rotate(-this.customPatternDirection * Math.PI / 180);
      
      // Then apply velocity-based rotation
      lineCtx.rotate(this.lineAngle * Math.PI / 180);
      
      lineCtx.translate(-W / 2, -H / 2);
      
      // Debug logging removed
      
      // Draw the custom pattern centered
      const imageSize = Math.max(W, H) * 1.5; // Make it larger to cover rotation
      lineCtx.drawImage(
        this.customPatternImage, 
        (W - imageSize) / 2, 
        (H - imageSize) / 2, 
        imageSize, 
        imageSize
      );
      lineCtx.restore();
    } else {
      // Draw generated parallel lines at specified angle with dynamic parameters
      lineCtx.strokeStyle = `rgba(255, 255, 255, ${finalIntensity})`;
      lineCtx.lineWidth = dynamicLineWidth; // Use dynamic line width based on normal force
      lineCtx.lineCap = 'round';

      const lineCount = Math.ceil(Math.sqrt(W * W + H * H) / dynamicSpacing); // Use dynamic spacing
      const angleRad = (this.lineAngle * Math.PI) / 180;
      
      for (let i = -lineCount; i <= lineCount; i++) {
        const offset = i * dynamicSpacing; // Use dynamic spacing for line offset
        
        lineCtx.beginPath();
        
        if (this.lineAngle === 0) {
          // Horizontal lines
          lineCtx.moveTo(0, offset);
          lineCtx.lineTo(W, offset);
        } else if (this.lineAngle === 90) {
          // Vertical lines
          lineCtx.moveTo(offset, 0);
          lineCtx.lineTo(offset, H);
        } else {
          // Diagonal lines
          const dx = Math.cos(angleRad);
          const dy = Math.sin(angleRad);
          
          // Calculate line start and end points
          let x1, y1, x2, y2;
          
          if (Math.abs(dx) > Math.abs(dy)) {
            // More horizontal
            x1 = -W * 2;
            y1 = offset + (x1 * dy / dx);
            x2 = W * 2;
            y2 = offset + (x2 * dy / dx);
          } else {
            // More vertical
            y1 = -H * 2;
            x1 = offset + (y1 * dx / dy);
            y2 = H * 2;
            x2 = offset + (y2 * dx / dy);
          }
          
          lineCtx.moveTo(x1, y1);
          lineCtx.lineTo(x2, y2);
        }
        
        lineCtx.stroke();
      }
    }
    
    // Get the line pattern as image data
    const linePatternData = lineCtx.getImageData(0, 0, W, H);
    
    // Create the final stencil by combining line pattern with intersection mask
    const finalStencil = new ImageData(W, H);
    for (let i = 0; i < mask.data.length; i += 4) {
      const maskAlpha = mask.data[i + 3];
      
      if (maskAlpha > 0) {
        // This pixel is in intersection area - keep the line pattern
        finalStencil.data[i] = linePatternData.data[i];     // R
        finalStencil.data[i + 1] = linePatternData.data[i + 1]; // G
        finalStencil.data[i + 2] = linePatternData.data[i + 2]; // B
        finalStencil.data[i + 3] = linePatternData.data[i + 3]; // A
      } else {
        // This pixel is outside intersection area - make it black
        finalStencil.data[i] = 0;
        finalStencil.data[i + 1] = 0;
        finalStencil.data[i + 2] = 0;
        finalStencil.data[i + 3] = 0;
      }
    }
    
    // Draw the final stencil
    this.stencilCtx.globalCompositeOperation = 'source-over';
    this.stencilCtx.putImageData(finalStencil, 0, 0);
    
    this.stencilCtx.restore();
  }
  
  // Render the current stencil to the display canvas
  render() {
    this.canvasCtx.clearRect(0, 0, this.pipRenderer.CFG.PIP_W, this.pipRenderer.CFG.PIP_H);
    
    // Always copy from stencil canvas to ensure we have the latest data
    this.canvasCtx.drawImage(this.stencilCanvas, 0, 0);
  }
  
  clear() {
    this.canvasCtx.fillStyle = '#000000';
    this.canvasCtx.fillRect(0, 0, this.pipRenderer.CFG.PIP_W, this.pipRenderer.CFG.PIP_H);
    
    this.stencilCtx.fillStyle = '#000000';
    this.stencilCtx.fillRect(0, 0, this.pipRenderer.CFG.PIP_W, this.pipRenderer.CFG.PIP_H);
    
    this.stencilData = null;
  }
  
  // Clear the accumulated stencil (reset to black)
  clearStencil() {
    this.clear();
  }
  
  // Update line stencil parameters
  setLineSpacing(spacing) {
    this.lineSpacing = spacing;
  }
  
  setLineWidth(width) {
    this.lineWidth = width;
  }
  
  // Set custom pattern mode
  setUseCustomPattern(useCustom) {
    this.useCustomPattern = useCustom;
  }
  
  // Detect the directional orientation of an image
  detectImageDirection(image) {
    return new Promise((resolve) => {
      const canvas = document.createElement('canvas');
      const ctx = canvas.getContext('2d');
      const size = 256; // Analyze at 256x256 for performance
      canvas.width = size;
      canvas.height = size;
      
      // Draw image scaled to analysis size
      ctx.drawImage(image, 0, 0, size, size);
      const imageData = ctx.getImageData(0, 0, size, size);
      const data = imageData.data;
      
      // Analyze gradients in different directions with improved detection
      const directions = [
        { angle: 0, name: 'horizontal', dx: 1, dy: 0 },
        { angle: 45, name: 'diagonal-right', dx: 1, dy: 1 },
        { angle: 90, name: 'vertical', dx: 0, dy: 1 },
        { angle: 135, name: 'diagonal-left', dx: -1, dy: 1 }
      ];
      
      const gradients = directions.map(dir => {
        let totalGradient = 0;
        let count = 0;
        
        // Sample more points for better detection
        for (let y = 2; y < size - 2; y += 2) {
          for (let x = 2; x < size - 2; x += 2) {
            const idx = (y * size + x) * 4;
            const idx2 = ((y + dir.dy * 2) * size + (x + dir.dx * 2)) * 4;
            const idx3 = ((y - dir.dy * 2) * size + (x - dir.dx * 2)) * 4;
            
            if (idx2 >= 0 && idx2 < data.length && idx3 >= 0 && idx3 < data.length) {
              // Calculate gradient magnitude using center point and both directions
              const r1 = data[idx];
              const g1 = data[idx + 1];
              const b1 = data[idx + 2];
              
              const r2 = data[idx2];
              const g2 = data[idx2 + 1];
              const b2 = data[idx2 + 2];
              
              const r3 = data[idx3];
              const g3 = data[idx3 + 1];
              const b3 = data[idx3 + 2];
              
              // Calculate gradients in both directions and use the maximum
              const gradient1 = Math.sqrt(
                (r2 - r1) ** 2 + (g2 - g1) ** 2 + (b2 - b1) ** 2
              );
              
              const gradient2 = Math.sqrt(
                (r1 - r3) ** 2 + (g1 - g3) ** 2 + (b1 - b3) ** 2
              );
              
              const gradient = Math.max(gradient1, gradient2);
              
              totalGradient += gradient;
              count++;
            }
          }
        }
        
        return {
          angle: dir.angle,
          name: dir.name,
          gradient: count > 0 ? totalGradient / count : 0
        };
      });
      
      // Additional analysis for vertical patterns (lines running top to bottom)
      let verticalScore = 0;
      let horizontalScore = 0;
      
      // Analyze vertical continuity (lines running top to bottom)
      for (let x = 0; x < size; x += 4) {
        let verticalContinuity = 0;
        for (let y = 1; y < size - 1; y++) {
          const idx = (y * size + x) * 4;
          const idxUp = ((y - 1) * size + x) * 4;
          const idxDown = ((y + 1) * size + x) * 4;
          
          if (idxUp >= 0 && idxDown < data.length) {
            const current = (data[idx] + data[idx + 1] + data[idx + 2]) / 3;
            const up = (data[idxUp] + data[idxUp + 1] + data[idxUp + 2]) / 3;
            const down = (data[idxDown] + data[idxDown + 1] + data[idxDown + 2]) / 3;
            
            // Check for vertical continuity (similar brightness in vertical direction)
            if (Math.abs(current - up) < 30 && Math.abs(current - down) < 30) {
              verticalContinuity++;
            }
          }
        }
        verticalScore += verticalContinuity;
      }
      
      // Analyze horizontal continuity (lines running left to right)
      for (let y = 0; y < size; y += 4) {
        let horizontalContinuity = 0;
        for (let x = 1; x < size - 1; x++) {
          const idx = (y * size + x) * 4;
          const idxLeft = (y * size + (x - 1)) * 4;
          const idxRight = (y * size + (x + 1)) * 4;
          
          if (idxLeft >= 0 && idxRight < data.length) {
            const current = (data[idx] + data[idx + 1] + data[idx + 2]) / 3;
            const left = (data[idxLeft] + data[idxLeft + 1] + data[idxLeft + 2]) / 3;
            const right = (data[idxRight] + data[idxRight + 1] + data[idxRight + 2]) / 3;
            
            // Check for horizontal continuity (similar brightness in horizontal direction)
            if (Math.abs(current - left) < 30 && Math.abs(current - right) < 30) {
              horizontalContinuity++;
            }
          }
        }
        horizontalScore += horizontalContinuity;
      }
      
      // Simple approach: for vertical lines, we expect:
      // - High horizontal continuity (lines run vertically, so horizontally they're consistent)
      // - Low vertical continuity (lines change vertically, so vertically they vary)
      
      // For horizontal lines, we expect:
      // - High vertical continuity (lines run horizontally, so vertically they're consistent)  
      // - Low horizontal continuity (lines change horizontally, so horizontally they vary)
      
      let detectedAngle = 0;
      
      if (verticalScore > horizontalScore * 1.5) {
        // High vertical continuity = horizontal lines = 0°
        detectedAngle = 0;
      } else if (horizontalScore > verticalScore * 1.5) {
        // High horizontal continuity = vertical lines = 90°
        detectedAngle = 90;
      } else {
        // Use gradient analysis for diagonals or ambiguous cases
        const strongestGradient = gradients.reduce((max, current) => 
          current.gradient > max.gradient ? current : max
        );
        detectedAngle = strongestGradient.angle;
      }
      
      const strongestDirection = {
        angle: detectedAngle,
        name: detectedAngle === 0 ? 'horizontal' : detectedAngle === 90 ? 'vertical' : 
              detectedAngle === 45 ? 'diagonal-right' : 'diagonal-left'
      };
      
      // Debug logging removed
      
      resolve(strongestDirection.angle);
    });
  }

  // Load custom pattern image
  loadCustomPattern(imageFile) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = (e) => {
        const img = new Image();
        img.onload = async () => {
          this.customPatternImage = img;
          
          // Detect the directional orientation of the image
          this.customPatternDirection = await this.detectImageDirection(img);
          
          // Debug logging removed
          resolve();
        };
        img.onerror = reject;
        img.src = e.target.result;
      };
      reader.onerror = reject;
      reader.readAsDataURL(imageFile);
    });
  }
  
  // Clear custom pattern
  clearCustomPattern() {
    this.customPatternImage = null;
    this.customPatternDirection = 0;
  }
  
  
  // Force update of the stencil with current parameters
  forceUpdate(velocity = null, normalForce = 1.0, intensityScale = 1.0, obbAngle = null, angularVelocity = null) {
    // Get the latest intersection data from PiP3
    const pip3Canvas = document.getElementById('pip3Canvas');
    if (pip3Canvas) {
      const intersectionData = pip3Canvas.getContext('2d').getImageData(0, 0, this.pipRenderer.CFG.PIP_W, this.pipRenderer.CFG.PIP_H);
      this.updateStencil(intersectionData, velocity, normalForce, intensityScale, obbAngle, angularVelocity);
      this.render();
    } else {
      // If no intersection data yet, just update with current parameters
      this.updateStencil(null, velocity, normalForce, intensityScale, obbAngle, angularVelocity);
      this.render();
    }
  }
  
  // Get the current stencil canvas for stamping
  getStencilCanvas() {
    return this.stencilCanvas;
  }
  
  // Get current stencil as image data
  getStencilImageData() {
    return this.stencilCtx.getImageData(0, 0, this.pipRenderer.CFG.PIP_W, this.pipRenderer.CFG.PIP_H);
  }
}
