// Motion sensors and touch controls -> one Float32Array packet, sent ~60 Hz.

import { FLAG_MOTION, FLAG_ORIENTATION, P, TRIGGER_COUNT } from '../shared/protocol.js';
import { el } from '../shared/util.js';
import { localXY, orient, pictureUp } from './orient.js';

// Trigger actions the preset row makes unnecessary.
const STEP_ACTIONS = ['presetPrev', 'presetNext'];

export class Sensors {
  constructor() {
    this.packet = new Float32Array(P.LENGTH);
    this.packet[P.PAD_X] = 0.5;
    this.packet[P.PAD_Y] = 0.5;
    this.seq = 0;
    this.flags = 0;
    this.permission = 'unknown'; // 'granted' | 'denied' | 'unknown'
    this.listening = false;
  }

  get needsPermission() {
    return typeof globalThis.DeviceOrientationEvent?.requestPermission === 'function' || typeof globalThis.DeviceMotionEvent?.requestPermission === 'function';
  }

  // iOS only shows the motion prompt from inside a tap handler, so this must
  // be called synchronously in one (before any await).
  requestPermission() {
    const asks = [];
    for (const Type of [globalThis.DeviceOrientationEvent, globalThis.DeviceMotionEvent]) {
      if (typeof Type?.requestPermission === 'function') asks.push(Type.requestPermission().catch(() => 'denied'));
    }
    // Listening is harmless without permission: the events just never fire.
    this.listen();
    return Promise.all(asks).then((results) => {
      this.permission = results.every((r) => r === 'granted') ? 'granted' : 'denied';
      return this.permission;
    });
  }

  listen() {
    if (this.listening) return;
    this.listening = true;
    const p = this.packet;
    window.addEventListener('deviceorientation', (e) => {
      if (e.beta === null || e.gamma === null) return;
      p[P.ALPHA] = e.alpha ?? 0;
      p[P.BETA] = e.beta;
      p[P.GAMMA] = e.gamma;
      this.flags |= FLAG_ORIENTATION;
    });
    window.addEventListener('devicemotion', (e) => {
      const r = e.rotationRate;
      const a = e.acceleration;
      if (!r && !a) return;
      p[P.ROT_ALPHA] = r?.alpha ?? 0;
      p[P.ROT_BETA] = r?.beta ?? 0;
      p[P.ROT_GAMMA] = r?.gamma ?? 0;
      p[P.ACC_X] = a?.x ?? 0;
      p[P.ACC_Y] = a?.y ?? 0;
      p[P.ACC_Z] = a?.z ?? 0;
      this.flags |= FLAG_MOTION;
    });
  }

  // Returns the packet to send now.
  next() {
    const p = this.packet;
    p[P.SEQ] = this.seq++;
    p[P.FLAGS] = this.flags;
    p[P.SCREEN] = pictureUp();
    p[P.TURN] = orient.picture;
    return p;
  }

  // XY pad: the live preview itself. A finger on the picture moves the dot
  // and reports its position 0..1 and whether it is down. The last position
  // is kept after release.
  mountPad(pad) {
    const dot = el('div', { class: 'pad-dot' });
    pad.classList.add('pad');
    pad.append(dot);
    const p = this.packet;
    let active = null;
    const move = (e) => {
      const { x, y } = localXY(pad, e);
      p[P.PAD_X] = x;
      p[P.PAD_Y] = 1 - y;
      dot.style.left = `${x * 100}%`;
      dot.style.top = `${y * 100}%`;
    };
    pad.addEventListener('pointerdown', (e) => {
      if (active !== null) return;
      active = e.pointerId;
      pad.setPointerCapture(e.pointerId);
      p[P.PAD_DOWN] = 1;
      pad.classList.add('down');
      move(e);
      e.preventDefault();
    });
    pad.addEventListener('pointermove', (e) => {
      if (e.pointerId === active) move(e);
    });
    const up = (e) => {
      if (e.pointerId !== active) return;
      active = null;
      p[P.PAD_DOWN] = 0;
      pad.classList.remove('down');
    };
    pad.addEventListener('pointerup', up);
    pad.addEventListener('pointercancel', up);
  }

  // Momentary buttons, one per trigger. Those bound to "previous preset" and
  // "next preset" are left out once the preset row below them is filled:
  // it does the same job directly.
  mountTriggers(row) {
    const p = this.packet;
    row.classList.add('triggers');
    this.triggerButtons = [];
    for (let i = 0; i < TRIGGER_COUNT; i++) {
      const button = el('button', { class: 'trig', text: `Trigger ${i + 1}` });
      const release = () => {
        p[P.TRIG_MASK] = (p[P.TRIG_MASK] | 0) & ~(1 << i);
        button.classList.remove('down');
      };
      button.addEventListener('pointerdown', (e) => {
        e.preventDefault();
        button.setPointerCapture(e.pointerId);
        p[P.TRIG_MASK] = (p[P.TRIG_MASK] | 0) | (1 << i);
        p[P.TRIG_COUNT + i] = (p[P.TRIG_COUNT + i] + 1) % 65536;
        button.classList.add('down');
      });
      button.addEventListener('pointerup', release);
      button.addEventListener('pointercancel', release);
      this.triggerButtons.push(button);
      row.append(button);
    }
  }

  setTriggerLabels(labels, actions = this.triggerActions ?? []) {
    this.triggerActions = actions;
    this.triggerButtons?.forEach((b, i) => {
      if (labels?.[i]) b.textContent = labels[i];
      b.hidden = this.presetCount > 0 && STEP_ACTIONS.includes(actions[i]);
    });
  }

  // One button per preset, the live one lit. The row is dragged sideways
  // when there are more than fit; a tap that did not drag picks a preset.
  mountPresets(row, onPick) {
    row.classList.add('presets');
    this.presetRow = row;
    this.presetCount = 0;
    let start = null;
    row.addEventListener('pointerdown', (e) => {
      row.setPointerCapture(e.pointerId);
      start = { at: localXY(row, e).x, scroll: row.scrollLeft, moved: false, target: e.target.closest('.preset') };
    });
    row.addEventListener('pointermove', (e) => {
      if (!start || !row.hasPointerCapture(e.pointerId)) return;
      const dx = (localXY(row, e).x - start.at) * row.clientWidth;
      if (Math.abs(dx) > 10) start.moved = true;
      if (start.moved) row.scrollLeft = start.scroll - dx;
    });
    const end = (e) => {
      if (start && !start.moved && start.target && e.type === 'pointerup') onPick(Number(start.target.dataset.index));
      start = null;
    };
    row.addEventListener('pointerup', end);
    row.addEventListener('pointercancel', end);
  }

  setPresets(names, current) {
    const row = this.presetRow;
    if (!row) return;
    this.presetCount = names.length;
    if (row.children.length !== names.length || [...row.children].some((b, i) => b.dataset.name !== names[i])) {
      row.replaceChildren(
        ...names.map((name, i) => {
          const b = el('button', { class: 'preset', 'data-index': String(i), 'data-name': name }, [el('b', { text: String(i + 1) }), el('span', { text: name })]);
          return b;
        }),
      );
    }
    [...row.children].forEach((b, i) => b.classList.toggle('on', i === current));
    const live = row.children[current];
    // Keep the live one in view, without fighting a finger on the row.
    if (live && !row.matches(':active')) {
      const left = live.offsetLeft - row.offsetLeft;
      if (left < row.scrollLeft || left + live.offsetWidth > row.scrollLeft + row.clientWidth) row.scrollLeft = left - 8;
    }
    this.setTriggerLabels(null);
  }
}
