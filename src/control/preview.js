// The monitor image /output sends back (small, about ten times a second).
// Any number of canvases can show it.

const canvases = new Set();
let installed = false;

export function attachPreview(ui, canvas) {
  canvases.add(canvas);
  if (installed) return;
  installed = true;
  let image = null;
  ui.bus.on('preview', (m) => {
    const { width, height, pixels } = m;
    if (!image || image.width !== width || image.height !== height) image = new ImageData(width, height);
    // GL rows arrive bottom-up.
    const stride = width * 4;
    for (let y = 0; y < height; y++) {
      image.data.set(pixels.subarray((height - 1 - y) * stride, (height - y) * stride), y * stride);
    }
    for (const c of canvases) {
      if (!c.isConnected || c.offsetParent === null) continue;
      if (c.width !== width || c.height !== height) {
        c.width = width;
        c.height = height;
      }
      c.getContext('2d').putImageData(image, 0, 0);
    }
  });
}
