// The camera of the mark (mark.js draws the mark itself), for the things
// that are drawn inside it: the Mac's pairing code and the opening
// (control/code-mark.js), and the phone's opening (phone/opening.js).
// viewBox "0 5 64 58"; the body runs from x 3 to 61 and y 14 to 60.

export const CAMERA = 'M12 14H42V10A2 2 0 0 1 44 8H52A2 2 0 0 1 54 10V14.2A9 9 0 0 1 61 23V51A9 9 0 0 1 52 60H12A9 9 0 0 1 3 51V23A9 9 0 0 1 12 14Z';
export const EYE_SHUT = 'M11.5 38Q32 39.5 52.5 38';
export const EYE_OPEN = 'M11.5 38Q32 18 52.5 38Q32 58 11.5 38Z';
// The square in the camera where the pairing code sits; the noise of the
// openings is drawn on the same grid, carried out to the camera's edges.
export const CODE = { x: 14, y: 19, size: 36 };

const NS = 'http://www.w3.org/2000/svg';
export const svgEl = (tag, attrs = {}) => {
  const node = document.createElementNS(NS, tag);
  for (const [k, v] of Object.entries(attrs)) node.setAttribute(k, v);
  return node;
};

// A number from 0 to 1 that is always the same for the same three inputs.
export const hash = (a, b, c) => {
  let h = (Math.imul(a, 374761393) + Math.imul(b, 668265263) + Math.imul(c, 1274126177)) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  h ^= h >>> 16;
  return ((h >>> 0) % 100000) / 100000;
};

// One square of the grid as a piece of an SVG path, `grow` times its size
// about its centre (a hair over 1 leaves no seams between neighbours).
export const square = (i, j, m, grow = 1.03) => {
  const s = m * grow;
  return `M${(CODE.x + i * m - (s - m) / 2).toFixed(3)} ${(CODE.y + j * m - (s - m) / 2).toFixed(3)}h${s.toFixed(3)}v${s.toFixed(3)}h-${s.toFixed(3)}z`;
};

// The squares of a frame of noise over the whole camera, as a path.
// `amount` (0..1) is how much of the camera the noise has taken; `settled`
// (0..1) how many squares have stopped on `final(i, j)`; `tick` picks the
// frame of noise.
export function noisePath(m, { amount, settled, tick, final }) {
  let d = '';
  const i0 = Math.floor((3 - CODE.x) / m);
  const i1 = Math.ceil((61 - CODE.x) / m);
  const j0 = Math.floor((8 - CODE.y) / m);
  const j1 = Math.ceil((60 - CODE.y) / m);
  for (let j = j0; j <= j1; j++) {
    for (let i = i0; i <= i1; i++) {
      const own = hash(i, j, 1);
      const on = settled > own ? final(i, j) : own < amount && hash(i, j, 100 + tick) > 0.5;
      if (on) d += square(i, j, m);
    }
  }
  return d;
}
