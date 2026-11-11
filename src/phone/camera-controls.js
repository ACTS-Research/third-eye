// Torch, zoom, exposure and focus controls. Each one is shown only when the
// running track's getCapabilities() reports it; nothing is assumed.

import { el } from '../shared/util.js';

function hasRange(cap) {
  return cap && typeof cap.min === 'number' && typeof cap.max === 'number' && cap.max > cap.min;
}

export class CameraControls {
  constructor(root, onError) {
    this.root = root;
    this.onError = onError;
    this.track = null;
    this.hasTorch = false;
    this.torchOn = false;
  }

  attach(track) {
    this.track = track;
    this.hasTorch = false;
    this.torchOn = false;
    this.root.replaceChildren();
    if (!track || typeof track.getCapabilities !== 'function') return;

    let caps = {};
    let settings = {};
    try {
      caps = track.getCapabilities() ?? {};
      settings = track.getSettings() ?? {};
    } catch {
      return;
    }
    this.caps = caps;
    this.hasTorch = caps.torch === true || (Array.isArray(caps.torch) && caps.torch.includes(true));

    if (hasRange(caps.zoom)) this.addSlider('Zoom', 'zoom', caps.zoom, settings.zoom);
    if (hasRange(caps.exposureCompensation)) this.addSlider('Exposure', 'exposureCompensation', caps.exposureCompensation, settings.exposureCompensation);
    if (hasRange(caps.focusDistance)) {
      this.addSlider('Focus', 'focusDistance', caps.focusDistance, settings.focusDistance, (c) => {
        // A manual distance only applies in manual focus mode.
        if (caps.focusMode?.includes('manual')) c.focusMode = 'manual';
        this.setLock('focusMode', true);
      });
    }

    const locks = el('div', { class: 'locks' });
    this.lockButtons = {};
    for (const [key, label] of [['exposureMode', 'Lock exposure'], ['focusMode', 'Lock focus'], ['whiteBalanceMode', 'Lock white bal.']]) {
      const modes = caps[key];
      if (!Array.isArray(modes) || !modes.includes('manual') || !modes.includes('continuous')) continue;
      const button = el('button', {
        text: label,
        onclick: () => {
          const locked = !button.classList.contains('on');
          this.apply({ [key]: locked ? 'manual' : 'continuous' }).then((ok) => ok && this.setLock(key, locked));
        },
      });
      button.classList.toggle('on', settings[key] === 'manual');
      this.lockButtons[key] = button;
      locks.append(button);
    }
    if (locks.children.length) this.root.append(locks);
  }

  setLock(key, locked) {
    this.lockButtons?.[key]?.classList.toggle('on', locked);
  }

  addSlider(label, key, cap, value, extend) {
    const input = el('input', {
      type: 'range',
      min: String(cap.min),
      max: String(cap.max),
      step: String(cap.step || (cap.max - cap.min) / 100),
      value: String(value ?? cap.min),
      oninput: () => {
        const constraint = { [key]: Number(input.value) };
        extend?.(constraint);
        this.apply(constraint);
      },
    });
    this.root.append(el('label', {}, [label, input]));
  }

  async apply(constraint) {
    if (!this.track) return false;
    try {
      await this.track.applyConstraints({ advanced: [constraint] });
      return true;
    } catch (err) {
      this.onError?.(`Camera refused ${Object.keys(constraint).join(', ')}: ${err.message || err.name}`);
      return false;
    }
  }

  async toggleTorch() {
    if (!this.hasTorch) return;
    const next = !this.torchOn;
    if (await this.apply({ torch: next })) this.torchOn = next;
  }
}
