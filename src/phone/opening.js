// The phone's opening: what START does. The start screen itself is calm
// (the mark, blinking now and then, and START). On the tap the mark blinks
// and turns solid, noise in hard squares fills the camera while the phone's
// own camera and the link to the Mac come up, and the noise clears to what
// the camera sees, in the camera's shape, before the live screen takes
// over. The noise lasts as long as starting really takes, between about a
// second and three. Skipped for anyone who has asked for less motion.

import { CAMERA, CODE, EYE_OPEN, EYE_SHUT, noisePath, svgEl } from '../shared/camera-shape.js';
import { el } from '../shared/util.js';

const T = { reopen: 120, into: 500, noise: 750, least: 1650, most: 3750, settle: 250, fade: 350 };
const NOISE_FRAME_MS = 70;
const M = CODE.size / 25;
// The camera's shape as a mask for the picture.
const MASK = `url("data:image/svg+xml,${encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 5 64 58"><path d="${CAMERA}"/></svg>`)}")`;

// `stream`: the phone's camera, or null (controller only). `ready()`: true
// once the picture and the link are up. Resolves when the overlay is gone.
export function playOpening({ stream, ready }) {
  if (matchMedia('(prefers-reduced-motion: reduce)').matches) return Promise.resolve();
  const body = svgEl('path', { d: CAMERA, fill: 'var(--ink)', stroke: 'var(--ink)', 'stroke-width': '2.7', 'stroke-linejoin': 'round' });
  const under = svgEl('svg', { viewBox: '0 5 64 58', 'aria-hidden': 'true' });
  under.append(body);
  const picture = el('video', { class: 'opening-picture', muted: true, playsInline: true, autoplay: true });
  picture.setAttribute('playsinline', '');
  picture.style.maskImage = MASK;
  picture.style.webkitMaskImage = MASK;
  if (stream) {
    picture.srcObject = stream;
    picture.play?.().catch(() => {});
  }
  const clip = svgEl('clipPath', { id: 'opening-camera' });
  clip.append(svgEl('path', { d: CAMERA }));
  const defs = svgEl('defs');
  defs.append(clip);
  const cells = svgEl('path', { d: '', fill: '#000', 'clip-path': 'url(#opening-camera)', 'shape-rendering': 'crispEdges' });
  const edge = svgEl('path', { d: CAMERA, fill: 'none', stroke: 'var(--ink)', 'stroke-width': '2.7', 'stroke-linejoin': 'round' });
  const eye = svgEl('g', { fill: 'none', stroke: '#000', 'stroke-width': '2.7', 'stroke-linejoin': 'round', 'stroke-linecap': 'round' });
  const lid = svgEl('path', { d: EYE_SHUT });
  const iris = svgEl('circle', { cx: '32', cy: '38', r: '4.05' });
  eye.append(lid, iris);
  const over = svgEl('svg', { viewBox: '0 5 64 58', role: 'img', 'aria-label': 'Starting' });
  over.append(defs, cells, edge, eye);
  const box = el('div', { class: 'opening-box' }, [under, picture, over]);
  const overlay = el('div', { id: 'opening', 'data-state': 'opening' }, [box]);
  document.body.append(overlay);

  return new Promise((done) => {
    const start = performance.now();
    let settleAt = 0;
    const step = (now) => {
      const t = now - start;
      // Hold the noise until starting is done, within its least and most.
      if (!settleAt && t >= T.noise && ((t >= T.least && ready()) || t >= T.most)) settleAt = t;
      const amount = t < T.into ? 0 : t < T.noise ? (t - T.into) / (T.noise - T.into) : 1;
      const settled = settleAt ? Math.min(1, (t - settleAt) / T.settle) : 0;
      const shut = t < T.reopen;
      lid.setAttribute('d', shut ? EYE_SHUT : EYE_OPEN);
      iris.style.display = shut ? 'none' : '';
      eye.style.display = amount < 1 ? '' : 'none';
      eye.setAttribute('opacity', String(1 - amount));
      // The noise clears to the picture (or, with no camera, to the solid
      // camera).
      picture.style.opacity = stream ? String(settled) : '0';
      cells.setAttribute('d', amount > 0 && settled < 1 ? noisePath(M, { amount, settled, tick: Math.floor(t / NOISE_FRAME_MS), final: () => false }) : '');
      if (settleAt && t >= settleAt + T.settle + 250) {
        overlay.dataset.state = 'leaving';
        overlay.style.opacity = '0';
        setTimeout(() => {
          picture.srcObject = null;
          overlay.remove();
          done();
        }, T.fade);
        return;
      }
      requestAnimationFrame(step);
    };
    requestAnimationFrame(step);
  });
}
