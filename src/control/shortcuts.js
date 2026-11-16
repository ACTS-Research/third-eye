import { KEYMAP } from '../shared/keys.js';
import { el } from '../shared/util.js';

export function mountShortcuts(root) {
  const list = el('dl', { class: 'stats' });
  const rows = [...KEYMAP.map((k) => [k.label, k.help]), ['Shift + 1 to 5', 'Input B, the one Mix B mixes in'], ['F', 'Fullscreen (in the output window)']];
  for (const [label, help] of rows) {
    list.append(el('dt', {}, [el('kbd', { text: label })]), el('dd', { text: help, style: 'text-align:left' }));
  }
  root.append(el('div', { class: 'panel', id: 'shortcuts' }, [el('h2', { text: 'Keys' }), list]));
}
