// GroundVariantManager - Handles GLB ground planes with material variants
// Uses wear accumulation as blend map and flow direction for texture rotation

import { GLTFLoader } from 'https://unpkg.com/three@0.158.0/examples/jsm/loaders/GLTFLoader.js';

export class GroundVariantManager {
  constructor(scene, world, A, CFG, THREE) {
    this.scene = scene;
    this.world = world;
    this.A = A;
    this.CFG = CFG;
    this.THREE = THREE;
    this.loader = new GLTFLoader();

    this.groundMesh = null;
    this.variantRoot = null;
    this.variantBodies = [];  // Store physics bodies from GLB
    this.shaderRefs = [];
    this.globalVariantNames = [];

    // Blend parameters
    this.smoothness = 0.5;
    this.contrast = 1.0;
    this.invert = false;
    this.rotationStrength = 180.0; // degrees
    this.flowThreshold = 0.1;
    this.enableFlow = false;
    this.scale = 1.0; // Ground scale

    // Textures
    this.wearBlendTexture = null;
    this.flowMapTexture = null;
  }

  /**
   * Load GLB file and apply variant blending
   */
  async loadGLB(file) {
    return new Promise((resolve, reject) => {
      const url = URL.createObjectURL(file);

      this.loader.load(url, async (gltf) => {
        // Remove previous variant ground
        if (this.variantRoot) {
          this.scene.remove(this.variantRoot);
          this.variantRoot = null;
        }

        this.shaderRefs.length = 0;

        const root = gltf.scene || gltf.scenes[0];
        this.variantRoot = root;

        // Position at ground level with scale
        root.position.y = 0;
        root.rotation.x = 0;
        root.scale.set(this.scale, this.scale, this.scale);

        this.scene.add(root);

        // Enable shadows and create physics bodies
        root.traverse(obj => {
          if (obj.isMesh) {
            obj.castShadow = false;
            obj.receiveShadow = true;
            
            // Create physics body for each mesh
            this.createPhysicsBodyForMesh(obj);
          }
        });

        // Get global variants
        const extRoot = gltf.userData?.gltfExtensions?.['KHR_materials_variants'];
        this.globalVariantNames = extRoot?.variants?.map(v => v.name) || [];

        // Apply variant blending to all meshes
        const tasks = [];
        root.traverse(obj => {
          if (obj.isMesh) {
            tasks.push(this.applyVariantBlend(obj, gltf));
          }
        });

        await Promise.all(tasks);
        this.updateUniforms();

        resolve({
          root,
          variantCount: this.globalVariantNames.length
        });
      }, undefined, reject);
    });
  }

  /**
   * Create a solid color texture in sRGB
   * NOTE: Store linear color values - Three.js handles sRGB conversion automatically
   */
  makeSolidSRGBTex(color) {
    const to8 = v => Math.round(this.THREE.MathUtils.clamp(v, 0, 1) * 255);
    const data = new Uint8Array([to8(color.r), to8(color.g), to8(color.b), 255]);
    const tex = new this.THREE.DataTexture(data, 1, 1, this.THREE.RGBAFormat);
    tex.colorSpace = this.THREE.SRGBColorSpace;
    tex.needsUpdate = true;
    tex.magFilter = this.THREE.LinearFilter;
    tex.minFilter = this.THREE.LinearFilter;
    return tex;
  }

  /**
   * Apply variant blending shader to a mesh
   */
  async applyVariantBlend(mesh, gltf) {
    const ext = mesh.userData?.gltfExtensions?.['KHR_materials_variants'];
    if (!ext || !ext.mappings) return false;

    const parser = gltf.parser;
    const Nfile = Math.max(2, this.globalVariantNames.length);

    // Sampler cap (leave room for other textures)
    const texUnits = 16; // Conservative estimate
    const SAMPLER_CAP = Math.max(2, texUnits - 4);
    const NUsed = Math.min(Nfile, SAMPLER_CAP);

    // Get variant materials
    const mats = new Array(NUsed).fill(mesh.material);
    for (const mapping of ext.mappings) {
      for (const vidx of mapping.variants) {
        if (vidx < NUsed) {
          mats[vidx] = await parser.getDependency('material', mapping.material);
        }
      }
    }

    // Extract base textures and properties
    const baseTex = mats.map(m =>
      m.map ? m.map : this.makeSolidSRGBTex((m.color || new this.THREE.Color(1,1,1)).clone())
    );
    const roughArr = new Float32Array(mats.map(m =>
      (typeof m.roughness === 'number') ? m.roughness : 1.0
    ));
    const metalArr = new Float32Array(mats.map(m =>
      (typeof m.metalness === 'number') ? m.metalness : 0.0
    ));

    const origMat = mesh.material;
    const normalTex = origMat.normalMap || null;
    const normalScale = (origMat.normalScale && origMat.normalScale.x) ? origMat.normalScale.x : 1.0;

    // Create new material
    const mat = new this.THREE.MeshStandardMaterial({
      color: 0xffffff,
      metalness: 1.0,
      roughness: 1.0,
      normalMap: normalTex
    });
    mat.normalScale = new this.THREE.Vector2(normalScale, normalScale);
    mat.defines = Object.assign({}, mat.defines, { USE_UV: '' });

    mat.onBeforeCompile = (shader) => {
      // Blend uniforms
      shader.uniforms.uBlendTex = { value: this.wearBlendTexture };
      shader.uniforms.uInvert = { value: this.invert ? 1 : 0 };
      shader.uniforms.uSmooth = { value: this.smoothness };
      shader.uniforms.uContrast = { value: this.contrast };

      // Flow uniforms
      shader.uniforms.uFlowTex = { value: this.flowMapTexture };
      shader.uniforms.uHasFlow = { value: this.flowMapTexture ? 1 : 0 };
      shader.uniforms.uRotStrength = { value: this.rotationStrength * Math.PI / 180.0 };
      shader.uniforms.uFlowThreshold = { value: this.flowThreshold };
      shader.uniforms.uEnableFlow = { value: this.enableFlow ? 1 : 0 };

      // Variant uniforms
      shader.uniforms.uN = { value: NUsed };
      shader.uniforms.uRoughArr = { value: roughArr };
      shader.uniforms.uMetalArr = { value: metalArr };
      for (let j = 0; j < NUsed; j++) {
        shader.uniforms['uBase' + j] = { value: baseTex[j] };
      }

      // GLSL declarations
      let samplerDecl = '';
      for (let i = 0; i < NUsed; i++) {
        samplerDecl += `uniform sampler2D uBase${i};\n`;
      }

      // Texture sampling with rotation
      // NOTE: No manual pow(2.2) gamma correction - Three.js handles sRGB→linear conversion
      // automatically when textures are marked with SRGBColorSpace
      let pickFn = `vec3 baseAt(int k, vec2 uv, float angle){\n`;
      pickFn += `  vec2 rotUv = rotateUV(uv, angle, vec2(0.5, 0.5));\n`;
      pickFn += `  vec3 c = texture2D(uBase0, rotUv).rgb;\n  if (k==0) return c;\n`;
      for (let i = 1; i < NUsed - 1; i++) {
        pickFn += `  c = texture2D(uBase${i}, rotUv).rgb;\n  if (k==${i}) return c;\n`;
      }
      pickFn += `  return texture2D(uBase${NUsed-1}, rotUv).rgb;\n}`;

      // Inject shader code
      shader.fragmentShader = shader.fragmentShader
        .replace('#include <common>', `#include <common>
          uniform sampler2D uBlendTex;
          uniform sampler2D uFlowTex;
          uniform int   uHasFlow;
          uniform int   uEnableFlow;
          uniform float uRotStrength;
          uniform float uFlowThreshold;
          uniform int   uInvert;
          uniform float uSmooth;
          uniform float uContrast;
          uniform int   uN;
          uniform float uRoughArr[${NUsed}];
          uniform float uMetalArr[${NUsed}];
          ${samplerDecl}

          float contrast01(float x, float k){ return pow(clamp(x,0.0,1.0), max(k, 0.0001)); }

          vec2 rotateUV(vec2 uv, float angle, vec2 center){
            float ca = cos(angle);
            float sa = sin(angle);
            mat2 R = mat2(ca, -sa, sa, ca);
            return R * (uv - center) + center;
          }

          ${pickFn}

          void blendN_byIntensity(vec2 uv, float inten, float rotAngle, out vec3 baseLin, out float rough, out float metal){
            float seg = float(uN - 1);
            float x = clamp(inten, 0.0, 1.0) * seg;
            int i = int(floor(x));
            i = clamp(i, 0, uN-2);
            float t = fract(x);
            float u = mix(t, smoothstep(0.0, 1.0, t), uSmooth);
            vec3 a = baseAt(i, uv, rotAngle);
            vec3 b = baseAt(i+1, uv, rotAngle);
            baseLin = mix(a, b, u);
            rough   = mix(uRoughArr[i], uRoughArr[i+1], u);
            metal   = mix(uMetalArr[i], uMetalArr[i+1], u);
          }
        `)
        .replace('#include <map_fragment>', `
          vec4 blendSample = texture2D(uBlendTex, vUv);
          float inten = dot(blendSample.rgb, vec3(0.2126, 0.7152, 0.0722));
          inten = (uInvert == 1) ? (1.0 - inten) : inten;
          inten = contrast01(inten, uContrast);

          // Flow map rotation
          float rotAngle = 0.0;
          if (uHasFlow == 1 && uEnableFlow == 1) {
            vec4 flowSample = texture2D(uFlowTex, vUv);
            float flowMag = length(flowSample.rg - vec2(0.5));
            float flowAlpha = flowSample.a;
            float isValid = step(uFlowThreshold, flowMag) * step(uFlowThreshold, flowAlpha);
            vec2 flowDir = flowSample.rg * 2.0 - 1.0;
            float angle = atan(flowDir.y, flowDir.x);
            rotAngle = angle * uRotStrength * isValid;
          }

          vec3 _base;
          float _rough;
          float _metal;
          blendN_byIntensity(vUv, inten, rotAngle, _base, _rough, _metal);
          diffuseColor.rgb *= _base;
        `)
        .replace('#include <roughnessmap_fragment>', `#include <roughnessmap_fragment>
          roughnessFactor = clamp(_rough, 0.04, 1.0);
        `)
        .replace('#include <metalnessmap_fragment>', `#include <metalnessmap_fragment>
          metalnessFactor = clamp(_metal, 0.0, 1.0);
        `);

      mesh.userData._shader = shader;
      if (!this.shaderRefs.includes(shader)) {
        this.shaderRefs.push(shader);
      }
    };

    mesh.material = mat;
    return true;
  }

  /**
   * Set wear accumulation texture as blend map
   */
  setWearBlendTexture(texture) {
    this.wearBlendTexture = texture;
    for (const sh of this.shaderRefs) {
      if (sh.uniforms.uBlendTex) {
        sh.uniforms.uBlendTex.value = texture;
      }
    }
  }

  /**
   * Set flow map texture
   */
  setFlowMapTexture(texture) {
    this.flowMapTexture = texture;
    for (const sh of this.shaderRefs) {
      if (sh.uniforms.uFlowTex) {
        sh.uniforms.uFlowTex.value = texture;
      }
      if (sh.uniforms.uHasFlow) {
        sh.uniforms.uHasFlow.value = texture ? 1 : 0;
      }
    }
  }

  /**
   * Set ground scale
   */
  setScale(scale) {
    this.scale = scale;
    if (this.variantRoot) {
      this.variantRoot.scale.set(scale, scale, scale);
      
      // Recreate physics bodies with new scale
      this.recreatePhysicsBodies();
    }
  }
  
  /**
   * Recreate all physics bodies (e.g., after scale change)
   */
  recreatePhysicsBodies() {
    if (!this.variantRoot || !this.world) return;
    
    // Remove old physics bodies
    for (const body of this.variantBodies) {
      this.world.removeRigidBody(body);
    }
    this.variantBodies = [];
    
    // Create new physics bodies with updated scale
    this.variantRoot.traverse(obj => {
      if (obj.isMesh) {
        this.createPhysicsBodyForMesh(obj);
      }
    });
    
    console.log(`Recreated ${this.variantBodies.length} physics bodies with scale ${this.scale}`);
  }

  /**
   * Update shader uniforms
   */
  updateUniforms() {
    const vals = {
      uInvert: this.invert ? 1 : 0,
      uSmooth: this.smoothness,
      uContrast: this.contrast,
      uRotStrength: this.rotationStrength * Math.PI / 180.0,
      uFlowThreshold: this.flowThreshold,
      uEnableFlow: this.enableFlow ? 1 : 0
    };

    for (const sh of this.shaderRefs) {
      if (sh.uniforms.uInvert) sh.uniforms.uInvert.value = vals.uInvert;
      if (sh.uniforms.uSmooth) sh.uniforms.uSmooth.value = vals.uSmooth;
      if (sh.uniforms.uContrast) sh.uniforms.uContrast.value = vals.uContrast;
      if (sh.uniforms.uRotStrength) sh.uniforms.uRotStrength.value = vals.uRotStrength;
      if (sh.uniforms.uFlowThreshold) sh.uniforms.uFlowThreshold.value = vals.uFlowThreshold;
      if (sh.uniforms.uEnableFlow) sh.uniforms.uEnableFlow.value = vals.uEnableFlow;
    }
  }

  /**
   * Create physics body for a mesh
   */
  createPhysicsBodyForMesh(mesh) {
    if (!this.world || !this.A) {
      console.error('Cannot create physics body: world or Ammo not available');
      return;
    }

    // Update world matrix to get correct transformations
    mesh.updateMatrixWorld(true);

    // Get mesh geometry
    const geometry = mesh.geometry;
    if (!geometry) {
      console.warn('Mesh has no geometry, skipping physics body');
      return;
    }

    // Create box shape from bounding box
    geometry.computeBoundingBox();
    const bbox = geometry.boundingBox;
    
    if (!bbox) {
      console.warn('Could not compute bounding box for mesh');
      return;
    }
    
    // Calculate half extents with scale applied
    const width = (bbox.max.x - bbox.min.x) / 2 * this.scale;
    const height = (bbox.max.y - bbox.min.y) / 2 * this.scale;
    const depth = (bbox.max.z - bbox.min.z) / 2 * this.scale;
    
    // For flat planes (height ≈ 0), use a minimum thickness of 0.5 (same as original ground)
    // For other meshes, ensure minimum size to avoid zero-size colliders
    const minSize = 0.01;
    const minHeight = 0.5;  // Minimum height for flat ground planes
    
    const halfExtents = new this.A.btVector3(
      Math.max(width, minSize),
      Math.max(height, minHeight),  // Use larger minimum for height
      Math.max(depth, minSize)
    );
    
    const shape = new this.A.btBoxShape(halfExtents);
    
    // For ground planes, position the collision body correctly
    const actualHeight = Math.max(height, minHeight);
    
    // Calculate the center of the bounding box in local space
    const bboxCenter = new this.THREE.Vector3(
      (bbox.max.x + bbox.min.x) / 2,
      (bbox.max.y + bbox.min.y) / 2,
      (bbox.max.z + bbox.min.z) / 2
    );
    
    // Transform bbox center to world space
    const localToWorld = mesh.matrixWorld.clone();
    bboxCenter.applyMatrix4(localToWorld);
    
    // Calculate the bottom of the mesh in world space
    const bboxMinY = bbox.min.y;
    const bboxMinWorld = new this.THREE.Vector3(0, bboxMinY, 0);
    bboxMinWorld.applyMatrix4(localToWorld);
    const meshBottomY = bboxMinWorld.y;
    
    // Position physics body so its bottom aligns with mesh bottom
    // Physics body center should be at: meshBottomY + actualHeight
    const physicsY = meshBottomY + actualHeight;
    
    // Create transform
    const transform = new this.A.btTransform();
    transform.setIdentity();
    transform.setOrigin(new this.A.btVector3(bboxCenter.x, physicsY, bboxCenter.z));
    
    // Get world rotation
    const worldQuat = new this.THREE.Quaternion();
    mesh.getWorldQuaternion(worldQuat);
    transform.setRotation(new this.A.btQuaternion(worldQuat.x, worldQuat.y, worldQuat.z, worldQuat.w));
    
    // Create rigid body (mass = 0 for static)
    const motionState = new this.A.btDefaultMotionState(transform);
    const rbInfo = new this.A.btRigidBodyConstructionInfo(0, motionState, shape, new this.A.btVector3(0, 0, 0));
    const body = new this.A.btRigidBody(rbInfo);
    
    // Set physics properties to match original ground
    body.setFriction(0.5);
    body.setRestitution(0.6);
    body.setRollingFriction(0.1);
    
    // Add to world
    this.world.addRigidBody(body);
    this.variantBodies.push(body);
    
    console.log(`✓ Created physics body: center(${bboxCenter.x.toFixed(2)}, ${physicsY.toFixed(2)}, ${bboxCenter.z.toFixed(2)}), halfExtents(${Math.max(width, minSize).toFixed(2)}, ${actualHeight.toFixed(2)}, ${Math.max(depth, minSize).toFixed(2)}), physicsBottom=${(physicsY - actualHeight).toFixed(2)}, meshBottom=${meshBottomY.toFixed(2)}`);
  }

  /**
   * Remove variant ground
   */
  remove() {
    // Remove physics bodies
    if (this.world && this.variantBodies.length > 0) {
      for (const body of this.variantBodies) {
        this.world.removeRigidBody(body);
      }
      this.variantBodies = [];
      console.log('Removed variant ground physics bodies');
    }
    
    // Remove visual mesh
    if (this.variantRoot) {
      this.scene.remove(this.variantRoot);
      this.variantRoot = null;
    }
    this.shaderRefs.length = 0;
  }

  /**
   * Set active variant index (updates all meshes)
   */
  setVariant(variantIndex) {
    if (!this.variantRoot) return;
    
    // This would require storing variant materials and switching them
    // For now, log the request
    console.log(`Variant switching to index ${variantIndex} - feature requires material variant system`);
    
    // TODO: Implement actual variant switching if KHR_materials_variants is present
  }

  /**
   * Get the actual world size of the variant ground
   * @returns {number} Size in world units (max of width/depth)
   */
  getGroundSize() {
    if (!this.variantRoot) return 0;
    
    // Calculate bounding box of entire variant root
    const box = new this.THREE.Box3();
    box.setFromObject(this.variantRoot);
    
    const size = box.getSize(new this.THREE.Vector3());
    // Return the larger of width or depth
    return Math.max(size.x, size.z);
  }

  /**
   * Get info about loaded variants
   */
  getInfo() {
    return {
      hasVariants: this.variantRoot !== null,
      variantCount: this.globalVariantNames.length,
      variantNames: [...this.globalVariantNames]
    };
  }
}
