# PiP OBB Physics - Enhanced Collision Visualization

An advanced physics visualization tool featuring **Oriented Bounding Box (OBB)** collision detection with multiple visualization modes including Picture-in-Picture (PiP) views, ground stamping, and real-time analytics.

## 🎯 Features

### Core Functionality
- **Multiple Body Types**: Cube (various subdivisions), Puck (torus), Custom GLB models
- **Advanced Bounding Box Algorithms**:
  - AABB (Axis-Aligned Bounding Box)
  - OBB (PCA-based Oriented Bounding Box)
  - OMBB (Optimal Minimum Bounding Box with Rotating Calipers)
  - KDOP-8 (K-Discrete Oriented Polytope)
  - Hybrid (Quantized + Quantile)
- **Real-time Physics**: Powered by Ammo.js (Bullet Physics)
- **Contact Point Visualization**: Red spheres marking collision points
- **Geometric Center Calculation**: Yellow marker showing the centroid of contact points

### Visualization Modes (6 PiP Views)
1. **Top View (+n)**: View from above the contact plane
2. **Bottom View (-n)**: View from below the contact plane
3. **Intersection**: Boolean intersection of top and bottom views
4. **Field Intensity**: Accumulated scalar heatmap with temporal persistence
5. **Flow Direction**: Vector field with HSL-colored arrows (hue = direction, brightness = magnitude)
6. **Combined Field+Flow**: Overlay visualization showing both field and flow data

### Advanced Field/Flow Accumulation System
- **Ground-Based Accumulation**: Field and flow rendered directly on ground plane texture
- **Stamp-Based**: Accumulates directly from intersection canvas (NO HULL COMPUTATION)
- **Uint32/Float32 Buffers**: Precise accumulation with spatial awareness
- **Spatial Gamma Variation**: Interior vs exterior gamma control for enhanced visualization
- **HSL Flow Encoding**: Direction mapped to hue, intensity to brightness
- **Configurable Parameters**:
  - **k**: Field intensity multiplier (0.1-10.0)
  - **Gamma Inner/Outer**: Spatial gamma variation (0.1-5.0)
  - **Intensity**: Overall brightness control (0.1-2.0)
- **Three Visualization Modes**: Field (grayscale), Flow (HSL), Combined (composite)
- **Direct Integration**: Works with PiP3 intersection canvas directly

### Ground Stamping System
- **Dynamic Stamping**: Real-time intersection projection onto ground plane
- **Full Opacity Control**: Starts at 0% for maximum control (0-100% range)
- **Export Functionality**: Save ground texture with stamps as PNG
- **Clear Function**: Remove all stamps instantly

### Field/Flow Analysis Tools
- **Save Field**: Export field intensity heatmap as PNG
- **Save Flow**: Export flow vector visualization as PNG
- **Save Combined**: Export composite field+flow view as PNG
- **Clear Field/Flow**: Reset all accumulation buffers instantly
- **Parameter Controls**:
  - **k**: Field intensity multiplier
  - **Gamma Inner/Outer**: Spatial contrast control
  - **Intensity**: Overall brightness adjustment
- **Ground Plane Visualization**: Toggle field/flow/combined layers on ground

### Advanced Controls
- Physics parameters (gravity, friction, restitution)
- Speed and force controls (X/Z axes)
- OBB padding adjustments (width, height, depth)
- Real-time algorithm switching
- Custom GLB model loading

## 📁 Project Structure

```
Intersection/
├── index.html              # Main HTML entry point
├── README.md              # This file
├── TODO.md                # Project tasks and roadmap
├── css/
│   └── style.css          # All styling
├── js/
│   ├── main.js            # Main application entry point
│   ├── textures.js        # Procedural texture generation
│   ├── contacts.js        # Contact sampling and geometric center
│   ├── utils.js           # General utilities
│   ├── bounding-box/      # Bounding box algorithms
│   │   ├── index.js       # Main bounding box module
│   │   ├── aabb.js        # Axis-aligned bounding box
│   │   ├── obb.js         # PCA-based OBB
│   │   ├── ombb.js        # Rotating calipers OMBB
│   │   ├── kdop.js        # K-DOP algorithm
│   │   ├── hybrid.js      # Hybrid algorithm
│   │   └── utils.js       # BB utilities
│   ├── stamp/             # Ground stamping system
│   │   └── stamp.js       # Stamp manager class
│   ├── field-flow/        # Field/Flow accumulation system
│   │   ├── index.js       # FieldFlowManager
│   │   ├── field-accumulator.js    # Scalar intensity field
│   │   ├── flow-accumulator.js     # Vector flow field
│   │   └── combined-renderer.js    # Combined view
│   ├── bodies/            # Physics body creation
│   │   ├── index.js       # Bodies module exports
│   │   ├── cube.js        # Cube body creation
│   │   ├── puck.js        # Puck (torus) creation
│   │   ├── custom.js      # Custom GLB loader
│   │   └── utils.js       # Body utilities
│   ├── pip/               # Picture-in-Picture views
│   │   ├── index.js       # PiP manager
│   │   ├── pip-base.js    # Base PiP renderer
│   │   ├── pip1.js        # Top view
│   │   ├── pip2.js        # Bottom view
│   │   ├── pip3.js        # Intersection view
│   │   ├── pip4-field.js  # Field intensity display
│   │   ├── pip5-flow.js   # Flow direction display
│   │   └── pip6-combined.js # Combined field+flow display
│   └── ui/                # User interface
│       ├── index.js       # UI module exports
│       ├── controls.js    # Control panel handlers
│       └── stats.js       # Statistics display
```

## 🚀 Getting Started

### Prerequisites
- Modern web browser with ES6 module support
- Web server (for module loading)

### Quick Start

1. **Clone or download** this repository

2. **Start a local web server**:
   ```bash
   # Python 3
   python -m http.server 8000
   
   # Node.js (with http-server)
   npx http-server -p 8000
   ```

3. **Open in browser**:
   ```
   http://localhost:8000
   ```

4. **Interact**:
   - Click "Start" to begin physics simulation
   - Adjust controls in the left panel
   - Watch real-time collision visualization
   - Observe PiP views on the right side
   - Ground stamps appear automatically when stamping is enabled

## 🎮 Controls

### Body Controls
- **Body Type**: Choose between cubes (10/20/50 subdivisions), puck, or custom GLB
- **Start/Reset**: Begin simulation or reset to initial state

### Physics Parameters
- **Speed X/Z**: Initial velocity components
- **Force X/Z**: Continuous force application
- **Gravity**: Gravitational acceleration (×0.01)
- **Friction**: Surface friction coefficient (0-2)
- **Restitution**: Bounce factor (0-1)

### Visualization
- **Bounding Box Algorithm**: Switch between AABB, OBB, OMBB, KDOP-8, Hybrid
- **Padding (Width/Height/Depth)**: Adjust OBB visualization size
- **Toggle Options**:
  - PiP Views
  - Show 3D Box
  - Contact Points
  - Geometric Center

### Stamping & Field/Flow
- **Enable Stamping**: Toggle ground stamping on/off
- **Stamp Opacity**: 0 = no stamping (default), 100 = fully opaque
- **Clear Stamps**: Remove all ground stamps
- **Export Ground**: Save composite ground texture as PNG
- **Field Gain**: Control field accumulation rate (0.01-0.50, default 0.10)
- **Clear Field/Flow**: Reset all field and flow accumulation buffers
- **Save Field/Flow/Combined**: Export field, flow, or combined visualization as PNG

## 🔧 Technical Details

### Dependencies
- **Three.js** (v0.158.0): 3D rendering and scene management
- **Ammo.js** (v0.0.11): Physics engine (Bullet wrapper)
- **ES6 Modules**: Modern JavaScript module system

### Key Algorithms

#### Geometric Center (formerly "Geometric Mean")
Correctly calculates the **centroid** (arithmetic mean) of all contact points:
```
center = Σ(points) / n
```

#### OMBB - Rotating Calipers
Finds the minimum-area oriented bounding box by testing all convex hull edge orientations.

#### Velocity-Based OBB Alignment
When velocity > 0.5 m/s, the bounding box aligns with the velocity vector for improved stability.

#### Wear Accumulation
Persistent accumulation of wear data without decay:
```javascript
if (contact) {
  // Accumulate velocity component
  wearVelocity[i] += alpha * tangentialVelocity
  // Accumulate normal force component
  wearForce[i] += alpha * normalForce
}
// No decay - wear history persists until manually cleared
```

#### Flow Vector Projection
Projects 3D velocity onto 2D contact plane basis:
```javascript
u = dot(velocity_xz, e1)
w = dot(velocity_xz, e2)
direction = normalize([u, w])
magnitude = clamp(|velocity| / v_max, 0, 1)
```

#### HSL Flow Encoding
- **Hue**: Flow direction angle (0-360°)
- **Saturation**: Fixed at 100% for vivid colors
- **Lightness**: Magnitude-based (30% + 50% × magnitude)

### Performance Optimizations
- Throttled stamping (50ms intervals)
- PiP rendering on-demand
- Efficient contact sampling
- Canvas-based texture generation

## 🐛 Known Issues & Limitations

- Zero opacity stamping is now properly handled (won't paint)
- OBB angle may jitter at very low velocities
- Custom GLB models should be convex for best physics results

## 📝 Future Enhancements

See `TODO.md` for detailed roadmap including:
- More body shapes (sphere, cylinder, cone)
- Multi-body physics
- Animation recording
- Additional export formats
- Keyboard shortcuts
- Undo/redo for stamps

## 📄 License

This project is open source. Feel free to use, modify, and distribute.

## 🤝 Contributing

Contributions welcome! Please ensure:
- Code follows existing style
- New features are documented
- Complex algorithms include comments

## 📧 Support

For issues or questions, please refer to the TODO.md file or examine the modular codebase structure.

---

**Built with ❤️ using Three.js and Ammo.js**
