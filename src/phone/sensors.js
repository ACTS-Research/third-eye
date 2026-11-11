// Motion sensors and touch controls -> one Float32Array packet, sent ~60 Hz.

import { FLAG_MOTION, FLAG_ORIENTATION, P, TRIGGER_COUNT } from '../shared/protocol.js';
import { el } from '../shared/util.js';

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
    p[P.SCREEN] = screen.orientation?.angle ?? Number(window.orientation) ?? 0;
    return p;
  }

  // XY pad: reports the finger position 0..1 and whether it is down. The
  // last position is kept after release.
  mountPad(root) {
    const dot = el('div', { class: 'pad-dot' });
    const pad = el('div', { class: 'pad' }, [el('span', { class: 'pad-label', text: 'XY' }), dot]);
    const p = this.packet;
    let active = null;
    const move = (e) => {
      const r = pad.getBoundingClientRect();
      const x = Math.min(1, Math.max(0, (e.clientX - r.left) / r.width));
      const y = Math.min(1, Math.max(0, 1 - (e.clientY - r.top) / r.height));
      p[P.PAD_X] = x;
      p[P.PAD_Y] = y;
      dot.style.left = `${x * 100}%`;
      dot.style.top = `${(1 - y) * 100}%`;
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
    root.append(pad);
  }

  // Four large momentary buttons.
  mountTriggers(root) {
    const p = this.packet;
    const row = el('div', { class: 'triggers' });
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
    root.append(row);
  }

  setTriggerLabels(labels) {
    this.triggerButtons?.forEach((b, i) => {
      if (labels[i]) b.textContent = labels[i];
    });
  }
}
