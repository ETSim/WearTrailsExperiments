// PiP 3 - Intersection View

export class PiP3 {
  constructor(pipRenderer) {
    this.pipRenderer = pipRenderer;
    this.canvasCtx = document.getElementById('pip3Canvas').getContext('2d', { willReadFrequently: true });
  }
  
  render(pixels1, pixels2) {
    this.canvasCtx.clearRect(0, 0, this.pipRenderer.CFG.PIP_W, this.pipRenderer.CFG.PIP_H);
    this.canvasCtx.globalCompositeOperation = 'source-over';

    const W = this.pipRenderer.CFG.PIP_W;
    const H = this.pipRenderer.CFG.PIP_H;

    // Compute raw intersection (no Y-flip)
    const intersectionData = new ImageData(W, H);
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
    this.canvasCtx.putImageData(intersectionData, 0, 0);
  }
  
  clear() {
    this.canvasCtx.clearRect(0, 0, this.pipRenderer.CFG.PIP_W, this.pipRenderer.CFG.PIP_H);
  }
}
