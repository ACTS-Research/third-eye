// Motion sensors and touch controls -> one Float32Array packet, sent ~60 Hz.

import { FLAG_MOTION, FLAG_ORIENTATION, P, TRIGGER_COUNT } from '../shared/protocol.js';
import { el } from '../shared/util.js';
import { localXY, orient, pictureUp, setGravity } from './orient.js';

// Presets are shown six at a time.
const BANK = 6;

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
      setGravity(e.beta, e.gamma);
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
      const button = el('button', { class: 'trig' }, [el('span', { class: 'lbl', text: `Trigger ${i + 1}` })]);
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

  // labels: what each button does; actions: the action ids behind them;
  // on: which are switches (freeze, blackout, bypass) that are on now.
  setTriggerLabels(labels, actions = this.triggerActions ?? [], on = this.triggerOn ?? []) {
    this.triggerActions = actions;
    this.triggerOn = on;
    this.triggerButtons?.forEach((b, i) => {
      if (labels?.[i]) b.firstChild.textContent = labels[i];
      b.hidden = this.presetCount > 0 && STEP_ACTIONS.includes(actions[i]);
      b.classList.toggle('on', !!on[i]);
    });
  }

  // Preset buttons, a bank of six at a time, all on screen. The live one is
  // lit. With more than six presets a slim button steps through the banks.
  mountPresets(root, onPick) {
    root.classList.add('presets');
    this.presetGrid = el('div', { class: 'bank' });
    this.bankButton = el('button', { class: 'bank-next', hidden: true, onclick: () => this.showBank(this.bank + 1) }, [el('span', { class: 'lbl' })]);
    root.append(this.presetGrid, this.bankButton);
    this.presetNames = [];
    this.presetCount = 0;
    this.presetCurrent = -1;
    this.bank = 0;
    this.presetGrid.addEventListener('click', (e) => {
      const b = e.target.closest('.preset');
      if (b && !b.disabled) onPick(Number(b.dataset.index));
    });
  }

  showBank(bank) {
    const names = this.presetNames;
    const banks = Math.max(1, Math.ceil(names.length / BANK));
    this.bank = ((bank % banks) + banks) % banks;
    const first = this.bank * BANK;
    this.presetGrid.replaceChildren(
      ...Array.from({ length: BANK }, (_, k) => {
        const i = first + k;
        const has = i < names.length;
        return el('button', { class: `preset${i === this.presetCurrent ? ' on' : ''}`, 'data-index': String(i), disabled: !has }, has ? [el('span', { class: 'lbl' }, [el('b', { text: String(i + 1) }), el('span', { class: 'pname', text: names[i] })])] : []);
      }),
    );
    this.bankButton.hidden = banks < 2;
    // Says what the next tap shows; short enough to read either way up.
    const next = ((this.bank + 1) % banks) * BANK;
    this.bankButton.firstChild.textContent = `Next ${next + 1}–${Math.min(next + BANK, names.length)}`;
    this.bankButton.setAttribute('aria-label', `Presets ${first + 1}–${Math.min(first + BANK, names.length)} of ${names.length} shown. Show the next bank.`);
  }

  setPresets(names, current) {
    if (!this.presetGrid) return;
    const moved = current !== this.presetCurrent;
    this.presetNames = names;
    this.presetCount = names.length;
    this.presetCurrent = current;
    // Follow the live preset to its bank when it changes.
    this.showBank(moved && current >= 0 ? Math.floor(current / BANK) : this.bank);
    this.setTriggerLabels(null);
  }
}
