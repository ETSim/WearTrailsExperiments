// Texture Generation Module

export function generateRandomGroundTexture(size = 1024, isNormalMap = false) {
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');
  
  if (isNormalMap) {
    // Generate flat normal map for ground with very subtle variations
    const imageData = ctx.createImageData(size, size);
    const data = imageData.data;
    
    for (let i = 0; i < data.length; i += 4) {
      const x = (i / 4) % size;
      const y = Math.floor((i / 4) / size);
      
      // Create very subtle height variations for flat surface
      const noise1 = Math.sin(x * 0.02) * Math.cos(y * 0.02) * 0.05;
      const noise2 = Math.sin(x * 0.008) * Math.cos(y * 0.008) * 0.02;
      const height = noise1 + noise2;
      
      // Calculate proper normals for flat surface
      const dx = Math.sin((x + 1) * 0.02) * Math.cos(y * 0.02) * 0.05 - height;
      const dy = Math.sin(x * 0.02) * Math.cos((y + 1) * 0.02) * 0.05 - height;
      
      // Convert gradients to normal map (tangent space)
      const normalX = -dx * 0.5 + 0.5; // Invert X for correct lighting
      const normalY = -dy * 0.5 + 0.5; // Invert Y for correct lighting  
      const normalZ = Math.sqrt(Math.max(0, 1 - (dx * dx + dy * dy))); // Ensure valid normal
      
      data[i] = Math.floor(normalX * 255);     // R (X normal)
      data[i + 1] = Math.floor(normalY * 255); // G (Y normal)
      data[i + 2] = Math.floor(normalZ * 255 * 0.5 + 127); // B (Z normal) - mostly pointing up
      data[i + 3] = 255;                       // A
    }
    
    ctx.putImageData(imageData, 0, 0);
  } else {
    // Flat white ground with subtle grain
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, size, size);
    
    // Add very subtle grain texture
    const imageData = ctx.getImageData(0, 0, size, size);
    const data = imageData.data;
    
    for (let i = 0; i < data.length; i += 4) {
      const noise = (Math.random() - 0.5) * 10; // Very subtle noise
      data[i] = Math.max(240, Math.min(255, 255 + noise));     // R
      data[i + 1] = Math.max(240, Math.min(255, 255 + noise)); // G
      data[i + 2] = Math.max(240, Math.min(255, 255 + noise)); // B
    }
    
    ctx.putImageData(imageData, 0, 0);
  }
  
  return canvas;
}

export function generateRandomCubeTexture(size = 512, isNormalMap = false) {
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');
  
  if (isNormalMap) {
    // Generate realistic sandpaper normal map
    const imageData = ctx.createImageData(size, size);
    const data = imageData.data;
    
    for (let i = 0; i < data.length; i += 4) {
      const x = (i / 4) % size;
      const y = Math.floor((i / 4) / size);
      
      // Multi-frequency noise for realistic sandpaper texture
      const noise1 = Math.sin(x * 0.3) * Math.cos(y * 0.3) * 0.3;
      const noise2 = Math.sin(x * 0.8) * Math.cos(y * 0.8) * 0.2;
      const noise3 = Math.sin(x * 1.5) * Math.cos(y * 1.5) * 0.1;
      const noise4 = Math.sin(x * 3.0) * Math.cos(y * 3.0) * 0.05;
      const randomNoise = (Math.random() - 0.5) * 0.15;
      
      const height = noise1 + noise2 + noise3 + noise4 + randomNoise;
      
      // Calculate gradients for proper normal map generation
      const dx = (Math.sin((x + 1) * 0.3) * Math.cos(y * 0.3) * 0.3 + 
                  Math.sin((x + 1) * 0.8) * Math.cos(y * 0.8) * 0.2 + 
                  Math.sin((x + 1) * 1.5) * Math.cos(y * 1.5) * 0.1 + 
                  Math.sin((x + 1) * 3.0) * Math.cos(y * 3.0) * 0.05) - height;
                  
      const dy = (Math.sin(x * 0.3) * Math.cos((y + 1) * 0.3) * 0.3 + 
                  Math.sin(x * 0.8) * Math.cos((y + 1) * 0.8) * 0.2 + 
                  Math.sin(x * 1.5) * Math.cos((y + 1) * 1.5) * 0.1 + 
                  Math.sin(x * 3.0) * Math.cos((y + 1) * 3.0) * 0.05) - height;
      
      // Convert gradients to tangent space normal map
      const intensity = 1.0; // Normal map intensity
      const normalX = -dx * intensity * 0.5 + 0.5;
      const normalY = -dy * intensity * 0.5 + 0.5;
      const normalZ = Math.sqrt(Math.max(0, 1 - ((normalX - 0.5) * 2) ** 2 - ((normalY - 0.5) * 2) ** 2)) * 0.5 + 0.5;
      
      data[i] = Math.floor(normalX * 255);     // R (X tangent)
      data[i + 1] = Math.floor(normalY * 255); // G (Y tangent)
      data[i + 2] = Math.floor(normalZ * 255); // B (Z normal)
      data[i + 3] = 255;                       // A
    }
    
    ctx.putImageData(imageData, 0, 0);
  } else {
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
  }
  
  return canvas;
}
