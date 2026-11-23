// The starting screen's one object: the camera of the mark, solid in the
// interface colour, with the pairing code centred in it (dark squares on
// the colour: every palette scans, at any dimmer setting; the owner tried
// them all on the iPhone, 23 November 2026).
//
// play() is the opening, once when a session starts: the mark as it is (in
// outline, the eye shut), the eye opens, a blink on which the camera turns
// solid, noise in the code's own squares filling the camera, and the noise
// settling into the code. Under three seconds; anyone who has asked their
// system for less motion gets the code at once.

import qrcode from 'qrcode-generator';
import { CAMERA, CODE, EYE_OPEN, EYE_SHUT, noisePath, square, svgEl } from '../shared/camera-shape.js';

// The moments of the opening, in milliseconds.
const T = { open: 300, blink: 900, reopen: 1020, into: 1500, noise: 1750, settle: 2650, code: 2900 };
const NOISE_FRAME_MS = 70;

export function codeMark() {
  const svg = svgEl('svg', { viewBox: '0 5 64 58', role: 'img', 'aria-label': 'Pairing code' });
  svg.classList.add('code-mark');
  const clip = svgEl('clipPath', { id: 'code-mark-camera' });
  clip.append(svgEl('path', { d: CAMERA }));
  const defs = svgEl('defs', {});
  defs.append(clip);
  const body = svgEl('path', { d: CAMERA, fill: 'var(--ink)', stroke: 'var(--ink)', 'stroke-width': '2.7', 'stroke-linejoin': 'round' });
  const cells = svgEl('path', { d: '', fill: '#000', 'clip-path': 'url(#code-mark-camera)', 'shape-rendering': 'crispEdges' });
  const eye = svgEl('g', { fill: 'none', 'stroke-width': '2.7', 'stroke-linejoin': 'round', 'stroke-linecap': 'round' });
  const lid = svgEl('path', { d: EYE_SHUT });
  const iris = svgEl('circle', { cx: '32', cy: '38', r: '4.05' });
  eye.append(lid, iris);
  svg.append(defs, body, cells, eye);

  let qr = null; // the code's squares
  let n = 25;
  let raf = 0;
  const dark = (i, j) => i >= 0 && j >= 0 && i < n && j < n && !!qr && qr.isDark(j, i);
  // The code as it stands once the opening is over.
  function showCode() {
    cancelAnimationFrame(raf);
    raf = 0;
    body.setAttribute('fill', 'var(--ink)');
    eye.style.display = 'none';
    const m = CODE.size / n;
    let d = '';
    // (A hair of overlap, so the squares leave no seams between them.)
    for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) if (dark(i, j)) d += square(i, j, m);
    cells.setAttribute('d', d);
    svg.dataset.state = 'code';
  }

  function frame(t) {
    const m = CODE.size / n;
    const reversed = t >= T.blink;
    const shut = t < T.open || (t >= T.blink && t < T.reopen);
    const amount = t < T.into ? 0 : t < T.noise ? (t - T.into) / (T.noise - T.into) : 1;
    const settled = t < T.settle ? 0 : (t - T.settle) / (T.code - T.settle);
    body.setAttribute('fill', reversed ? 'var(--ink)' : 'none');
    eye.style.display = t < T.noise ? '' : 'none';
    eye.setAttribute('stroke', reversed ? '#000' : 'var(--ink)');
    eye.setAttribute('opacity', String(1 - amount));
    lid.setAttribute('d', shut ? EYE_SHUT : EYE_OPEN);
    iris.style.display = shut ? 'none' : '';
    // Noise in the code's own squares, over the whole camera. It comes in
    // square by square, and goes out as each square stops on what it is in
    // the code (nothing, outside the code).
    const d = amount > 0 ? noisePath(m, { amount, settled, tick: Math.floor(t / NOISE_FRAME_MS), final: dark }) : '';
    cells.setAttribute('d', d);
  }

  return {
    node: svg,
    // The link the code carries. Drawn at once unless the opening is playing.
    setText(text) {
      qr = qrcode(0, 'M');
      qr.addData(text);
      qr.make();
      n = qr.getModuleCount();
      if (!raf) showCode();
    },
    // The opening. Resolves when the code stands.
    play() {
      if (matchMedia('(prefers-reduced-motion: reduce)').matches) {
        showCode();
        return Promise.resolve();
      }
      return new Promise((done) => {
        const start = performance.now();
        svg.dataset.state = 'opening';
        const step = (now) => {
          const t = now - start;
          if (t >= T.code) {
            showCode();
            done();
            return;
          }
          frame(t);
          raf = requestAnimationFrame(step);
        };
        cancelAnimationFrame(raf);
        raf = requestAnimationFrame(step);
      });
    },
  };
}
