// Rendering Module
// Handles PiP rendering and texture regeneration

export function setupPiPCanvases(CFG) {
  const pip1Canvas = document.getElementById('pip1Canvas');
  const pip2Canvas = document.getElementById('pip2Canvas');
  const pip3Canvas = document.getElementById('pip3Canvas');
  
  const pip1Ctx = pip1Canvas.getContext('2d', { willReadFrequently: true });
  const pip2Ctx = pip2Canvas.getContext('2d', { willReadFrequently: true });
  const pip3Ctx = pip3Canvas.getContext('2d', { willReadFrequently: true });
  
  return { pip1Ctx, pip2Ctx, pip3Ctx };
}

export function renderPiPViews(
  pipEnabled,
  lastOBB,
  CFG,
  renderer,
  scene,
  pipCam1,
  pipCam2,
  renderTarget1,
  renderTarget2,
  pip1Ctx,
  pip2Ctx,
  pip3Ctx,
  paddingWidthScale,
  paddingHeightScale,
  paddingDepthScale,
  THREE
) {
  if (!pipEnabled || !lastOBB) {
    pip1Ctx.clearRect(0, 0, CFG.PIP_W, CFG.PIP_H);
    pip2Ctx.clearRect(0, 0, CFG.PIP_W, CFG.PIP_H);
    pip3Ctx.clearRect(0, 0, CFG.PIP_W, CFG.PIP_H);
    return null;
  }

  // Update cameras
  updatePiPCameras(pipCam1, pipCam2, lastOBB, paddingWidthScale, paddingHeightScale, paddingDepthScale, CFG, THREE);

  // Render PiP1
  renderer.setRenderTarget(renderTarget1);
  renderer.render(scene, pipCam1);
  
  const pixels1 = new Uint8Array(CFG.PIP_W * CFG.PIP_H * 4);
  renderer.readRenderTargetPixels(renderTarget1, 0, 0, CFG.PIP_W, CFG.PIP_H, pixels1);
  const imageData1 = new ImageData(new Uint8ClampedArray(pixels1), CFG.PIP_W, CFG.PIP_H);
  pip1Ctx.putImageData(imageData1, 0, 0);
  
  // Render PiP2
  renderer.setRenderTarget(renderTarget2);
  renderer.render(scene, pipCam2);
  
  const pixels2 = new Uint8Array(CFG.PIP_W * CFG.PIP_H * 4);
  renderer.readRenderTargetPixels(renderTarget2, 0, 0, CFG.PIP_W, CFG.PIP_H, pixels2);
  const imageData2 = new ImageData(new Uint8ClampedArray(pixels2), CFG.PIP_W, CFG.PIP_H);
  pip2Ctx.putImageData(imageData2, 0, 0);
  
  renderer.setRenderTarget(null);
  
  // Compute intersection
  pip3Ctx.clearRect(0, 0, CFG.PIP_W, CFG.PIP_H);
  pip3Ctx.globalCompositeOperation = 'source-over';
  const intersectionData = new ImageData(CFG.PIP_W, CFG.PIP_H);
  for (let i = 0; i < pixels1.length; i += 4) {
    const has1 = (pixels1[i] | pixels1[i+1] | pixels1[i+2]) > 10;
    const has2 = (pixels2[i] | pixels2[i+1] | pixels2[i+2]) > 10;
    if (has1 && has2) {
      intersectionData.data[i]   = 255;
      intersectionData.data[i+1] = 255;
      intersectionData.data[i+2] = 255;
      intersectionData.data[i+3] = 255;
    } else {
      intersectionData.data[i]   = 0;
      intersectionData.data[i+1] = 0;
      intersectionData.data[i+2] = 0;
      intersectionData.data[i+3] = 0;
    }
  }
  pip3Ctx.putImageData(intersectionData, 0, 0);
  
  return intersectionData;
}

function updatePiPCameras(pipCam1, pipCam2, lastOBB, paddingWidthScale, paddingHeightScale, paddingDepthScale, CFG, THREE) {
  const center = new THREE.Vector3(lastOBB.center.x, lastOBB.center.y, lastOBB.center.z);
  const n = new THREE.Vector3(lastOBB.n.x, lastOBB.n.y, lastOBB.n.z).normalize();
  const e1 = new THREE.Vector3(lastOBB.e1.x, lastOBB.e1.y, lastOBB.e1.z).normalize();
  const e2 = new THREE.Vector3(lastOBB.e2.x, lastOBB.e2.y, lastOBB.e2.z).normalize();
  const w = Math.max(0.1, lastOBB.width) * paddingWidthScale;
  const h = Math.max(0.1, lastOBB.height) * paddingHeightScale;
  const d = CFG.OBB_DEPTH * paddingDepthScale;
  
  // Top camera (+n direction)
  const pos1 = center.clone().addScaledVector(n, d * 0.5);
  pipCam1.position.copy(pos1);
  pipCam1.up.copy(e1);
  pipCam1.left = -w * 0.65;
  pipCam1.right = w * 0.65;
  pipCam1.top = h * 0.65;
  pipCam1.bottom = -h * 0.65;
  pipCam1.near = 0.1;
  pipCam1.far = d * 2;
  pipCam1.lookAt(center);
  pipCam1.updateProjectionMatrix();
  
  // Bottom camera (-n direction)
  const pos2 = center.clone().addScaledVector(n, -d * 0.5);
  pipCam2.position.copy(pos2);
  pipCam2.up.copy(e1);
  pipCam2.left = -w * 0.65;
  pipCam2.right = w * 0.65;
  pipCam2.top = h * 0.65;
  pipCam2.bottom = -h * 0.65;
  pipCam2.near = 0.1;
  pipCam2.far = d * 2;
  pipCam2.lookAt(center);
  pipCam2.updateProjectionMatrix();
}

export function regenerateTextures(groundBaseTexture, generateRandomGroundTexture, dynMesh, shapeType, generateRandomCubeTexture, THREE) {
  // Regenerate ground base texture
  const newGroundCanvas = generateRandomGroundTexture(2048);
  groundBaseTexture.image = newGroundCanvas;
  groundBaseTexture.needsUpdate = true;
  
  // Regenerate cube texture if it exists
  if (dynMesh && shapeType.startsWith('cube')) {
    const newCubeTexture = new THREE.CanvasTexture(generateRandomCubeTexture(512));
    newCubeTexture.wrapS = THREE.RepeatWrapping;
    newCubeTexture.wrapT = THREE.RepeatWrapping;
    dynMesh.material.map = newCubeTexture;
    dynMesh.material.needsUpdate = true;
  }
}
