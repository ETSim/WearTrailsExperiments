// PiP 3 - Intersection View

export class PiP3 {
  constructor(pipRenderer) {
    this.pipRenderer = pipRenderer;
    this.canvasCtx = document.getElementById('pip3Canvas').getContext('2d');
  }
  
  render(pixels1, pixels2) {
    this.canvasCtx.clearRect(0, 0, this.pipRenderer.CFG.PIP_W, this.pipRenderer.CFG.PIP_H);
    this.canvasCtx.globalCompositeOperation = 'source-over';
    
    const W = this.pipRenderer.CFG.PIP_W;
    const H = this.pipRenderer.CFG.PIP_H;
    
    // Create flipped version of pixels1 (top view) - flip Y axis
    const pixels1Flipped = new Uint8Array(pixels1.length);
    for (let y = 0; y < H; y++) {
      for (let x = 0; x < W; x++) {
        const srcIdx = (y * W + x) * 4;
        const dstIdx = ((H - 1 - y) * W + x) * 4;
        pixels1Flipped[dstIdx] = pixels1[srcIdx];
        pixels1Flipped[dstIdx + 1] = pixels1[srcIdx + 1];
        pixels1Flipped[dstIdx + 2] = pixels1[srcIdx + 2];
        pixels1Flipped[dstIdx + 3] = pixels1[srcIdx + 3];
      }
    }
    
    // Compute intersection using flipped top view
    const intersectionData = new ImageData(W, H);
    for (let i = 0; i < pixels1Flipped.length; i += 4) {
      const has1 = (pixels1Flipped[i] | pixels1Flipped[i+1] | pixels1Flipped[i+2]) > 10;
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
    this.canvasCtx.putImageData(intersectionData, 0, 0);
  }
  
  clear() {
    this.canvasCtx.clearRect(0, 0, this.pipRenderer.CFG.PIP_W, this.pipRenderer.CFG.PIP_H);
  }
}
