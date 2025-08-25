# WearTrails Experiments — Renamed Build

![GLTF/GLB](https://img.shields.io/badge/GLTF%2FGLB-detected-blue) ![ammo.js](https://img.shields.io/badge/ammo.js-detected-blue) ![stats.js](https://img.shields.io/badge/stats.js-detected-blue) ![three.js](https://img.shields.io/badge/three.js-detected-blue) ![Files](https://img.shields.io/badge/experiments-8-success)

This folder contains the experiments renamed based on each file’s actual content (titles/headings, detected features, and libraries).

## Quick start
- Open any `.html` file directly in a modern browser.
- Use the on-screen UI panels to drop objects, tweak physics, and toggle paint/wear systems.

## Experiments

### paint_contact_full_collision_directional.html
_from `contact-paint-physics.html` — title detected:_ **Contact Paint Physics - Full Collision System**
- **Features:** `full_collision` `contact` `impact` `directional`
- **Libs:** three.js, stats.js
- **Summary:** Dynamic paint marks from motion/contacts; supports trails, impacts, and layering.
- **Pros:**
  - Accurate contact areas and penetration handling.
  - Consistent contact-driven triggering; intuitive for surface interactions.
  - Crisp hit marks; good for collisions and discrete events.
  - Anisotropic effects (with/against grain) for richer visuals.
- **Cons:**
  - More compute; tuning penetration resolution can be tricky.
  - Noisy contact signals may need filtering/debouncing.
  - Discrete splats lack continuity; can look staccato under high frequency.
  - More parameters to tune; risk of unnatural bias if mis-set.

### dynamic_paint_contact_slip_uv_trails_obb.html
_from `dynamic_paint_fast_obb.html` — title detected:_ **Ammo.js Physics - Dynamic Paint (UV Trails + OBB Hull + Deferred Decals)**
- **Features:** `contact` `dynamic_paint` `slip` `obb` `hull_patches` `uv_trails` `deferred_decals` `directional`
- **Libs:** three.js, ammo.js, stats.js
- **Summary:** Dynamic paint marks from motion/contacts; supports trails, impacts, and layering.
- **Pros:**
  - Consistent contact-driven triggering; intuitive for surface interactions.
  - Responsive, continuous marks from motion—great for trails and smears.
  - Realistic smearing along tangential motion; good for wear/paint streaks.
  - Faster broad-phase; stable bounding volumes for moving parts.
- **Cons:**
  - Noisy contact signals may need filtering/debouncing.
  - Parameter heavy (brush size, damping); can smear too aggressively.
  - Can cause ghosting if sampling is low; sensitive to timestep.
  - Less precise on concave/complex geometry; corner artifacts possible.

### dynamic_paint_contact_slip_vector_field_uv_trails.html
_from `dynamic_paint_vector_field.html` — title detected:_ **Ammo.js Physics - Dynamic Paint (UV Trails + OBB Hull + Deferred Decals)**
- **Features:** `contact` `dynamic_paint` `slip` `vector_field` `obb` `hull_patches` `uv_trails` `deferred_decals` `directional`
- **Libs:** three.js, ammo.js, stats.js
- **Summary:** Dynamic paint marks from motion/contacts; supports trails, impacts, and layering.
- **Pros:**
  - Consistent contact-driven triggering; intuitive for surface interactions.
  - Responsive, continuous marks from motion—great for trails and smears.
  - Realistic smearing along tangential motion; good for wear/paint streaks.
  - Smooth, controllable flow and directionality; stable accumulation.
- **Cons:**
  - Noisy contact signals may need filtering/debouncing.
  - Parameter heavy (brush size, damping); can smear too aggressively.
  - Can cause ghosting if sampling is low; sensitive to timestep.
  - Extra memory/CPU for field updates; requires careful authoring.

### dynamic_paint_contact_slip_vector_field_hull_patches.html
_from `precise_paint_physics.html` — title detected:_ **Slip-Based Dynamic Paint with Continuous Vector Field**
- **Features:** `contact` `dynamic_paint` `slip` `vector_field` `hull_patches` `directional`
- **Libs:** three.js, ammo.js, stats.js
- **Summary:** Dynamic paint marks from motion/contacts; supports trails, impacts, and layering.
- **Pros:**
  - Consistent contact-driven triggering; intuitive for surface interactions.
  - Responsive, continuous marks from motion—great for trails and smears.
  - Realistic smearing along tangential motion; good for wear/paint streaks.
  - Smooth, controllable flow and directionality; stable accumulation.
- **Cons:**
  - Noisy contact signals may need filtering/debouncing.
  - Parameter heavy (brush size, damping); can smear too aggressively.
  - Can cause ghosting if sampling is low; sensitive to timestep.
  - Extra memory/CPU for field updates; requires careful authoring.

### paint_slip_impact_vector_field_multilayer.html
_from `precise_paint_physics_impact.html` — title detected:_ **Advanced Multi-Layer Paint System with GLB Support**
- **Features:** `contact` `slip` `impact` `vector_field` `hull_patches` `uv_trails` `glb` `multilayer` `directional` `precise`
- **Libs:** three.js, ammo.js, stats.js, GLTF/GLB
- **Summary:** Dynamic paint marks from motion/contacts; supports trails, impacts, and layering.
- **Pros:**
  - Consistent contact-driven triggering; intuitive for surface interactions.
  - Realistic smearing along tangential motion; good for wear/paint streaks.
  - Crisp hit marks; good for collisions and discrete events.
  - Smooth, controllable flow and directionality; stable accumulation.
- **Cons:**
  - Noisy contact signals may need filtering/debouncing.
  - Can cause ghosting if sampling is low; sensitive to timestep.
  - Discrete splats lack continuity; can look staccato under high frequency.
  - Extra memory/CPU for field updates; requires careful authoring.

### wear_simulation_contact_slip_uv_trails_hull_patches.html
_from `precise_wear_simulation (1).html` — title detected:_ **Advanced Hardness-Based Wear Simulation with Traction Analysis**
- **Features:** `contact` `slip` `obb` `hull_patches` `uv_trails` `hardness` `traction` `wear` `directional`
- **Libs:** three.js, ammo.js, stats.js
- **Summary:** Wear accumulation driven by contact/slip, with optional directional and hardness/traction cues.
- **Pros:**
  - Consistent contact-driven triggering; intuitive for surface interactions.
  - Realistic smearing along tangential motion; good for wear/paint streaks.
  - Faster broad-phase; stable bounding volumes for moving parts.
  - Good performance for complex shapes using simplified hulls.
- **Cons:**
  - Noisy contact signals may need filtering/debouncing.
  - Can cause ghosting if sampling is low; sensitive to timestep.
  - Less precise on concave/complex geometry; corner artifacts possible.
  - Approximation may miss fine features; requires pre-processing.

### wear_simulation_contact_slip_impact_obb.html
_from `precise_wear_simulation.html` — title detected:_ **Precise Directional Wear Simulation with OBB Hull Patches**
- **Features:** `contact` `slip` `impact` `obb` `hull_patches` `uv_trails` `wear` `directional` `precise`
- **Libs:** three.js, ammo.js, stats.js
- **Summary:** Wear accumulation driven by contact/slip, with optional directional and hardness/traction cues.
- **Pros:**
  - Consistent contact-driven triggering; intuitive for surface interactions.
  - Realistic smearing along tangential motion; good for wear/paint streaks.
  - Crisp hit marks; good for collisions and discrete events.
  - Faster broad-phase; stable bounding volumes for moving parts.
- **Cons:**
  - Noisy contact signals may need filtering/debouncing.
  - Can cause ghosting if sampling is low; sensitive to timestep.
  - Discrete splats lack continuity; can look staccato under high frequency.
  - Less precise on concave/complex geometry; corner artifacts possible.

### wear_simulation_contact_slip_impact_obb_v2.html
_from `precise_wear_simulation_2.html` — title detected:_ **Precise Directional Wear Simulation with OBB Hull Patches**
- **Features:** `contact` `slip` `impact` `obb` `hull_patches` `uv_trails` `wear` `directional` `precise`
- **Libs:** three.js, ammo.js, stats.js
- **Summary:** Wear accumulation driven by contact/slip, with optional directional and hardness/traction cues.
- **Pros:**
  - Consistent contact-driven triggering; intuitive for surface interactions.
  - Realistic smearing along tangential motion; good for wear/paint streaks.
  - Crisp hit marks; good for collisions and discrete events.
  - Faster broad-phase; stable bounding volumes for moving parts.
- **Cons:**
  - Noisy contact signals may need filtering/debouncing.
  - Can cause ghosting if sampling is low; sensitive to timestep.
  - Discrete splats lack continuity; can look staccato under high frequency.
  - Less precise on concave/complex geometry; corner artifacts possible.

## How the code is structured (simple)

- **HTML shell:** A single HTML file per experiment, including script tags for libraries and the demo logic.
- **Scene/Canvas setup:** Creates a WebGL canvas (often via Three.js) and initial camera/lights.
- **Physics init:** Sets up the Ammo.js world (broadphase, solver), then creates rigid bodies for the scene objects.
- **Paint/Wear system:** Keeps textures or buffers representing paint/wear and updates them from contacts, slip, impacts, or a vector field.
- **Vector field (if present):** A small grid/texture controlling direction and intensity of strokes/smears.
- **Decals/UV trails (if present):** Either draw decals in screen/mesh space or write into UV-space textures bound to materials.
- **UI controls:** Sliders/toggles (dat.gui or lil-gui) to adjust brush size, damping, thresholds, and layer blending.
- **Main loop:** `requestAnimationFrame` → step physics → accumulate paint/wear → render frame → repeat.
- **Assets (if GLB/GLTF):** Models are loaded at start; materials are patched to support layered paint/wear.