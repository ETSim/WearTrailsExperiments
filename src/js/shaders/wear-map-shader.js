// GPU-Accelerated Wear Map Shaders
// Implements logarithmic color scaling for better visualization

export const wearMapVertexShader = `
  varying vec2 vUv;
  void main() {
    vUv = uv;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

export const wearMapFragmentShader = `
  uniform sampler2D slidingDistanceMap;
  uniform float maxSlidingDist;
  uniform float groundSize;
  uniform float maxMass;
  uniform float maxSpeed;
  uniform float pressure;
  uniform float friction;
  uniform bool useLogScale;
  
  varying vec2 vUv;

  // Logarithmic scaling function: log10(1 + 9*x)
  float logScale(float value, float maxValue) {
    if (value <= 0.0) return 0.0;
    float normalized = value / maxValue;
    return log(1.0 + normalized * 9.0) / log(10.0);
  }

  // Thermal colormap: black -> blue -> cyan -> yellow -> red -> white
  vec3 thermalColor(float t) {
    t = clamp(t, 0.0, 1.0);
    vec3 color;
    
    if (t < 0.25) {
      float s = t / 0.25;
      color = vec3(0.0, 0.0, s);
    } else if (t < 0.5) {
      float s = (t - 0.25) / 0.25;
      color = vec3(0.0, s, 1.0);
    } else if (t < 0.75) {
      float s = (t - 0.5) / 0.25;
      color = vec3(s, 1.0, 1.0 - s);
    } else {
      float s = (t - 0.75) / 0.25;
      color = vec3(1.0, 1.0 - s * 0.5, 0.0);
    }
    
    return color;
  }

  void main() {
    // Sample accumulated sliding distance and velocity from texture
    vec4 slidingData = texture2D(slidingDistanceMap, vUv);
    float globalSlidingDistance = slidingData.r; // R channel: sliding distance
    float relativeTangentialVelocity = slidingData.g; // G channel: velocity
    
    // Calculate traction: τ = μ × pressure
    float tangentialTraction = friction * pressure;
    
    // Comprehensive wear = GlobalSliding × Traction × Velocity
    float wear = globalSlidingDistance * tangentialTraction * relativeTangentialVelocity;
    
    // Apply normalization
    float normalizedWear;
    if (useLogScale) {
      normalizedWear = logScale(wear, maxSlidingDist * maxMass * maxSpeed);
    } else {
      normalizedWear = clamp(wear / (maxSlidingDist * maxMass * maxSpeed), 0.0, 1.0);
    }
    
    // Apply thermal colormap
    vec3 color = thermalColor(normalizedWear);
    
    gl_FragColor = vec4(color, 1.0);
  }
`;

