// Keyboard shortcuts, active in both /control and /output.

import { runAction } from './actions.js';
import { INPUT_KINDS, INPUT_LABELS } from './state.js';
import { isTypingTarget } from './util.js';

export const KEYMAP = [
  { keys: ['b'], label: 'B', action: 'blackout', help: 'Blackout (panic)' },
  { keys: [' '], label: 'Space', action: 'freeze', help: 'Freeze frame' },
  { keys: ['x'], label: 'X', action: 'bypassAll', help: 'Bypass all effects' },
  { keys: ['g'], label: 'G', action: 'glitch', help: 'Glitch burst' },
  { keys: [']', 'ArrowRight'], label: '] or →', action: 'presetNext', help: 'Next preset (crossfade)' },
  { keys: ['[', 'ArrowLeft'], label: '[ or ←', action: 'presetPrev', help: 'Previous preset (crossfade)' },
  { keys: ['r'], label: 'R', action: 'record', help: 'Record the output on / off' },
  { keys: ['t'], label: 'T', action: 'tap', help: 'Tap tempo' },
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
  });
}
