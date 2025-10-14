// General Utility Functions

export function saveCanvasAsPNG(canvas, filename) {
  canvas.toBlob(blob => {
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
  });
}

/**
 * Check if pixel has content using alpha channel (more robust than RGB)
 * Works with dark materials and transparent regions
 * @param {Uint8ClampedArray} pixels - Pixel data in RGBA format
 * @param {number} pixelIdx - Index into pixel array (must be multiple of 4)
 * @returns {boolean} True if pixel has content
 */
export function hasPixelContent(pixels, pixelIdx) {
  // Primary: check alpha channel for opacity
  const alpha = pixels[pixelIdx + 3];
  if (alpha > 10) return true;
  
  // Fallback: check RGB for non-black pixels (backward compatibility)
  return (pixels[pixelIdx] | pixels[pixelIdx+1] | pixels[pixelIdx+2]) > 10;
}

/**
 * Sanitize physics values - replace NaN/Inf with safe defaults
 * @param {number} value - Value to sanitize
 * @param {number} defaultValue - Default value if invalid (default: 0)
 * @returns {number} Sanitized value
 */
export function sanitizePhysicsValue(value, defaultValue = 0) {
  if (!isFinite(value) || isNaN(value)) {
    return defaultValue;
  }
  return value;
}

/**
 * Sanitize 3D vector - replace NaN/Inf components with safe defaults
 * @param {Object} vec - Vector {x, y, z}
 * @param {Object} defaultVec - Default vector if invalid (default: {x:0, y:0, z:0})
 * @returns {Object} Sanitized vector
 */
export function sanitizeVector3(vec, defaultVec = {x: 0, y: 0, z: 0}) {
  return {
    x: sanitizePhysicsValue(vec.x, defaultVec.x),
    y: sanitizePhysicsValue(vec.y, defaultVec.y),
    z: sanitizePhysicsValue(vec.z, defaultVec.z)
  };
}