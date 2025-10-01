// Texture Generation Module

export function generateRandomGroundTexture(size = 1024) {
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');
  
  // Flat white ground
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, size, size);
  
  return canvas;
}

export function generateRandomCubeTexture(size = 512) {
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');
  
  // Base red color for sandpaper look
  ctx.fillStyle = '#cc3333';
  ctx.fillRect(0, 0, size, size);
  
  // Get image data to add noise
  const imageData = ctx.getImageData(0, 0, size, size);
  const data = imageData.data;
  
  // Add fine-grained noise to simulate sandpaper texture
  for (let i = 0; i < data.length; i += 4) {
    // Random noise variation (-40 to +40)
    const noise = (Math.random() - 0.5) * 80;
    
    // Apply noise to RGB channels (keep red dominant)
    data[i] = Math.max(0, Math.min(255, data[i] + noise));     // R
    data[i + 1] = Math.max(0, Math.min(255, data[i + 1] + noise * 0.5)); // G (less variation)
    data[i + 2] = Math.max(0, Math.min(255, data[i + 2] + noise * 0.5)); // B (less variation)
    // Alpha stays at 255 (fully opaque)
  }
  
  ctx.putImageData(imageData, 0, 0);
  
  // Add some clustered noise for more realistic sandpaper effect
  ctx.globalAlpha = 0.3;
  for (let i = 0; i < 5000; i++) {
    const x = Math.random() * size;
    const y = Math.random() * size;
    const radius = Math.random() * 2 + 0.5;
    const brightness = Math.random() > 0.5 ? 255 : 0;
    
    // Use reddish tones for the dots
    const r = brightness;
    const g = brightness * 0.3;
    const b = brightness * 0.3;
    
    ctx.fillStyle = `rgb(${r}, ${g}, ${b})`;
    ctx.beginPath();
    ctx.arc(x, y, radius, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.globalAlpha = 1.0;
  
  return canvas;
}
