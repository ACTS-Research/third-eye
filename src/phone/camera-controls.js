// Torch, zoom, exposure and focus controls. Each one is shown only when the
// running track's getCapabilities() reports it; nothing is assumed. Zoom gets
// the tall fader at the side of the screen; torch and the white-balance lock
// are buttons on the live screen (main.js draws them and asks here); the
// rest live in the camera panel.

import { el } from '../shared/util.js';
import { fader } from './widgets.js';

function hasRange(cap) {
  return cap && typeof cap.min === 'number' && typeof cap.max === 'number' && cap.max > cap.min;
}

export class CameraControls {
  constructor(root, zoomRoot, onError) {
    this.root = root;
    this.zoomRoot = zoomRoot;
    this.onError = onError;
    this.track = null;
    this.hasTorch = false;
    this.torchOn = false;
  }

  attach(track) {
    this.track = track;
    this.hasTorch = false;
    this.torchOn = false;
    this.hasWhiteLock = false;
    this.whiteLocked = false;
    this.root.replaceChildren();
    this.zoomRoot.replaceChildren();
    this.zoomRoot.hidden = true;
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

    if (hasRange(caps.zoom)) {
      this.zoomRoot.append(this.slider('Zoom', 'zoom', caps.zoom, settings.zoom, { vertical: true, bare: true }));
      this.zoomRoot.hidden = false;
    }
    if (hasRange(caps.exposureCompensation)) this.root.append(this.slider('Exposure', 'exposureCompensation', caps.exposureCompensation, settings.exposureCompensation));
    if (hasRange(caps.focusDistance)) {
      this.root.append(
        this.slider('Focus', 'focusDistance', caps.focusDistance, settings.focusDistance, {
          extend: (c) => {
            // A manual distance only applies in manual focus mode.
            if (caps.focusMode?.includes('manual')) c.focusMode = 'manual';
            this.setLock('focusMode', true);
          },
        }),
      );
    }

    const canLock = (key) => Array.isArray(caps[key]) && caps[key].includes('manual') && caps[key].includes('continuous');
    this.hasWhiteLock = canLock('whiteBalanceMode');
    this.whiteLocked = settings.whiteBalanceMode === 'manual';

    const locks = el('div', { class: 'locks' });
    this.lockButtons = {};
    for (const [key, label] of [['exposureMode', 'Lock exposure'], ['focusMode', 'Lock focus']]) {
      if (!canLock(key)) continue;
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

  slider(label, key, cap, value, { vertical = false, bare = false, format, extend } = {}) {
    return fader({
      label,
      min: cap.min,
      max: cap.max,
      step: cap.step || (cap.max - cap.min) / 100,
      value: value ?? cap.min,
      vertical,
      bare,
      format,
      onInput: (v) => {
        const constraint = { [key]: v };
        extend?.(constraint);
        this.apply(constraint);
      },
    });
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

  async toggleWhiteLock() {
    if (!this.hasWhiteLock) return;
    const next = !this.whiteLocked;
    if (await this.apply({ whiteBalanceMode: next ? 'manual' : 'continuous' })) this.whiteLocked = next;
  }

  async toggleTorch() {
    if (!this.hasTorch) return;
    const next = !this.torchOn;
    if (await this.apply({ torch: next })) this.torchOn = next;
  }
}
