// A fader in the style of the control page's: a bar that fills. Dragged, not
// a native slider, so it works whatever turn the live screen is drawn with.

import { el } from '../shared/util.js';
import { localXY } from './orient.js';

export function fader({ label, min, max, step, value, vertical = false, format = (v) => v.toFixed(1), onInput }) {
  const fill = el('div', { class: 'fill' });
  const track = el('div', { class: 'track' }, [fill]);
  const val = el('span', { class: 'val' });
  const node = el('div', { class: `fader${vertical ? ' v' : ''}`, role: 'slider', 'aria-label': label, 'aria-valuemin': String(min), 'aria-valuemax': String(max) }, [
    track,
    el('span', { class: 'name', text: label }),
    val,
  ]);
  let current = value ?? min;
  const draw = () => {
    const frac = (current - min) / (max - min || 1);
    fill.style[vertical ? 'height' : 'width'] = `${frac * 100}%`;
    val.textContent = format(current);
    node.setAttribute('aria-valuenow', String(current));
  };
  const set = (e) => {
    const { x, y } = localXY(track, e);
    const frac = vertical ? 1 - y : x;
    let next = min + frac * (max - min);
    if (step) next = min + Math.round((next - min) / step) * step;
    next = Math.min(max, Math.max(min, next));
    if (next === current) return;
    current = next;
    draw();
    onInput?.(current);
  };
  node.addEventListener('pointerdown', (e) => {
    node.setPointerCapture(e.pointerId);
    set(e);
    e.preventDefault();
  });
  node.addEventListener('pointermove', (e) => {
    if (node.hasPointerCapture(e.pointerId)) set(e);
  });
  draw();
  return node;
}
