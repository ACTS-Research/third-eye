// Draws a QR code on a canvas: always black on white, whatever the palette,
// because that is what cameras read best.

import qrcode from 'qrcode-generator';

export function drawQr(canvas, text, { level = 'M', size = canvas.width } = {}) {
  const qr = qrcode(0, level);
  qr.addData(text);
  qr.make();
  const n = qr.getModuleCount();
  const quiet = 3;
  const scale = Math.max(2, Math.floor(size / (n + quiet * 2)));
  const side = (n + quiet * 2) * scale;
  canvas.width = side;
  canvas.height = side;
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#fff';
  ctx.fillRect(0, 0, side, side);
  ctx.fillStyle = '#000';
  for (let r = 0; r < n; r++) {
    for (let c = 0; c < n; c++) {
      if (qr.isDark(r, c)) ctx.fillRect((c + quiet) * scale, (r + quiet) * scale, scale, scale);
    }
  }
  return n;
}
