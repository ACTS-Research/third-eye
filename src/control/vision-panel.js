// MediaPipe features. Each is off until switched on here; results show up
// as sources under Modulation, and segmentation feeds "Apply to" on effects.

import { el } from '../shared/util.js';

const FEATURES = [
  ['face', 'Face', 'Head pose and expressions'],
  ['hands', 'Hands', 'Position, pinch, openness'],
  ['gesture', 'Gestures', 'Fist, palm, thumbs, victory…'],
  ['pose', 'Body pose', 'Position, arms, lean'],
  ['segment', 'Segmentation', 'Person / background mask for effects'],
];
const STATE_TEXT = { off: '', loading: 'loading…', ready: 'on', error: 'error' };

export function mountVisionPanel(root, ui) {
  const { store } = ui;
  const buttons = {};
  const badges = {};
  const grid = el('div', { class: 'vision-grid' });
  for (const [key, label, help] of FEATURES) {
    badges[key] = el('span', { class: 'small dim' });
    buttons[key] = el('button', { title: help, onclick: () => store.merge('vision', { [key]: !store.state.vision[key] }) }, [label, badges[key]]);
    grid.append(buttons[key]);
  }
  const delegate = el('select', {
    title: 'Where inference runs',
    onchange: () => store.merge('vision', { delegate: delegate.value }),
  }, [el('option', { value: 'GPU', text: 'Run on GPU' }), el('option', { value: 'CPU', text: 'Run on CPU' })]);
  const note = el('div', { class: 'dim small keep-3', id: 'vision-note' });

  const sync = () => {
    const v = store.state.vision;
    for (const [key] of FEATURES) buttons[key].classList.toggle('on', v[key]);
    delegate.value = v.delegate;
  };
  store.subscribe((op) => {
    if (op.op === 'replace' || (op.op === 'merge' && op.key === 'vision')) sync();
  });

  ui.onStatus((status) => {
    const v = status?.vision;
    const wanted = store.state.vision;
    const errors = [];
    for (const [key, label] of FEATURES) {
      const f = v?.features?.[key];
      badges[key].textContent = wanted[key] ? ` ${STATE_TEXT[f?.state ?? 'loading'] ?? ''}` : '';
      if (wanted[key] && f?.state === 'error') errors.push(`${label}: ${f.error}`);
    }
    const usesMask = store.state.chain.some((it) => it.target !== 'all' && !it.bypass);
    ui.setAlert('mask', status && usesMask && !wanted.segment ? 'An effect is set to person / background only, but Segmentation is off — it applies to the whole picture' : null);
    ui.setAlert('vision', errors.length ? `Vision: ${errors.join(' · ')}` : null);
    if (!v?.enabled) {
      note.textContent = 'All off. Each feature costs GPU and CPU time; switch on only what a preset uses.';
      return;
    }
    const delegates = [...new Set(Object.values(v.features).map((f) => f.delegate).filter(Boolean))].join(' + ');
    const input = status.input.kind === 'pattern' ? ' Needs a camera or video input.' : '';
    note.textContent = errors.length ? errors.join(' · ') : v.hz > 0 ? `${v.ms.toFixed(0)} ms per pass · ${v.hz.toFixed(0)} per second${delegates ? ` · ${delegates}` : ''}` : `Waiting for frames.${input}`;
  });

  root.append(
    el('div', { class: 'panel', id: 'vision-panel' }, [el('h2', { text: 'Vision (MediaPipe)' }), grid, el('div', { class: 'row' }, [delegate]), note]),
  );
  sync();
}
