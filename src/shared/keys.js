// Keyboard shortcuts, active in both /control and /output.

import { runAction } from './actions.js';
import { INPUT_KINDS, INPUT_LABELS } from './state.js';
import { isTypingTarget } from './util.js';

export const KEYMAP = [
  { keys: ['Backspace', 'Delete'], label: 'Delete', action: 'blackout', help: 'Blackout (panic)' },
  { keys: [' '], label: 'Space', action: 'freeze', help: 'Freeze frame' },
  { keys: ['x'], label: 'X', action: 'bypassAll', help: 'Bypass all effects' },
  { keys: ['b'], label: 'B', action: 'blink', help: 'Blink' },
  { keys: [']', 'ArrowRight'], label: '] or →', action: 'presetNext', help: 'Next step of the show, or next preset when it has none' },
  { keys: ['[', 'ArrowLeft'], label: '[ or ←', action: 'presetPrev', help: 'Previous step, or previous preset' },
  { keys: ['r'], label: 'R', action: 'record', help: 'Record the output on / off' },
  { keys: ['t'], label: 'T', action: 'tap', help: 'Tap tempo' },
  { keys: ['k'], label: 'K', action: 'clockRun', help: 'MIDI clock: Start / Stop, while it is being sent' },
  { keys: ['i'], label: 'I', action: 'inputNext', help: 'Next input' },
  ...INPUT_KINDS.map((kind, i) => ({
    keys: [String(i + 1)],
    label: String(i + 1),
    action: 'input',
    arg: kind,
    help: `Input: ${INPUT_LABELS[kind]}`,
  })),
];

export function installKeys(store, extra = {}) {
  window.addEventListener('keydown', (e) => {
    if (e.metaKey || e.ctrlKey || e.altKey || e.repeat) return;
    if (isTypingTarget(e.target)) return;
    // Shift + 1 to 5 choose input B. (Read from the key's place on the
    // keyboard: with Shift held, e.key is a punctuation mark.)
    const digit = e.shiftKey ? /^Digit([1-9])$/.exec(e.code) : null;
    if (digit && INPUT_KINDS[digit[1] - 1]) {
      e.preventDefault();
      runAction(store, 'inputB', INPUT_KINDS[digit[1] - 1]);
      return;
    }
    const key = e.key.length === 1 ? e.key.toLowerCase() : e.key;
    if (extra[key]) {
      e.preventDefault();
      extra[key](e);
      return;
    }
    const hit = KEYMAP.find((k) => k.keys.includes(key));
    if (!hit) return;
    e.preventDefault();
    runAction(store, hit.action, hit.arg);
    if (hit.action === 'blink') blinkDown = true;
  });
  // A blink set to hold lasts while B is down.
  let blinkDown = false;
  const blinkUp = () => {
    if (!blinkDown) return;
    blinkDown = false;
    runAction(store, 'blinkEnd');
  };
  window.addEventListener('keyup', (e) => {
    if (e.key.toLowerCase() === 'b') blinkUp();
  });
  window.addEventListener('blur', blinkUp);
}
