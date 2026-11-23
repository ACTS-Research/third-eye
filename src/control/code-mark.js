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

// The camera of the mark (shared/mark.js): body from x 3 to 61, y 14 to 60.
const CAMERA = 'M12 14H42V10A2 2 0 0 1 44 8H52A2 2 0 0 1 54 10V14.2A9 9 0 0 1 61 23V51A9 9 0 0 1 52 60H12A9 9 0 0 1 3 51V23A9 9 0 0 1 12 14Z';
const EYE_SHUT = 'M11.5 38Q32 39.5 52.5 38';
const EYE_OPEN = 'M11.5 38Q32 18 52.5 38Q32 58 11.5 38Z';
// Where the code sits in the camera.
const CODE = { x: 14, y: 19, size: 36 };
// The moments of the opening, in milliseconds.
const T = { open: 300, blink: 900, reopen: 1020, into: 1500, noise: 1750, settle: 2650, code: 2900 };
const NOISE_FRAME_MS = 70;

const NS = 'http://www.w3.org/2000/svg';
const svgEl = (tag, attrs) => {
  const node = document.createElementNS(NS, tag);
  for (const [k, v] of Object.entries(attrs)) node.setAttribute(k, v);
  return node;
};
// A number from 0 to 1 that is always the same for the same three inputs.
const hash = (a, b, c) => {
  let h = (Math.imul(a, 374761393) + Math.imul(b, 668265263) + Math.imul(c, 1274126177)) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  h ^= h >>> 16;
  return ((h >>> 0) % 100000) / 100000;
};

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
  const square = (i, j, m, grow) => {
    const s = m * grow;
    return `M${(CODE.x + i * m - (s - m) / 2).toFixed(3)} ${(CODE.y + j * m - (s - m) / 2).toFixed(3)}h${s.toFixed(3)}v${s.toFixed(3)}h-${s.toFixed(3)}z`;
  };

  // The code as it stands once the opening is over.
  function showCode() {
    cancelAnimationFrame(raf);
    raf = 0;
    body.setAttribute('fill', 'var(--ink)');
    eye.style.display = 'none';
    const m = CODE.size / n;
    let d = '';
    // (A hair of overlap, so the squares leave no seams between them.)
    for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) if (dark(i, j)) d += square(i, j, m, 1.03);
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
    let d = '';
    if (amount > 0) {
      // Noise in the code's own squares, over the whole camera. It comes in
      // square by square, and goes out as each square stops on what it is
      // in the code (nothing, outside the code).
      const tick = Math.floor(t / NOISE_FRAME_MS);
      const i0 = Math.floor((3 - CODE.x) / m);
      const i1 = Math.ceil((61 - CODE.x) / m);
      const j0 = Math.floor((8 - CODE.y) / m);
      const j1 = Math.ceil((60 - CODE.y) / m);
      for (let j = j0; j <= j1; j++) {
        for (let i = i0; i <= i1; i++) {
          const own = hash(i, j, 1);
          const on = settled > own ? dark(i, j) : own < amount && hash(i, j, 100 + tick) > 0.5;
          if (on) d += square(i, j, m, 1.03);
        }
      }
    }
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
