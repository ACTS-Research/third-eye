// MediaPipe features. Each is off until switched on here; results show up
// as sources under Modulation, and segmentation feeds "Apply to" on effects.
// Segmentation also runs, without being switched on here, while a live
// effect is driven by the body (its badge then reads "on for the body").

import { el } from '../shared/util.js';
import { menu } from './controls.js';

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
  const delegate = menu({
    label: 'Where inference runs',
    options: [
      { value: 'GPU', label: 'Run on GPU' },
      { value: 'CPU', label: 'Run on CPU' },
    ],
    value: store.state.vision.delegate,
    onChange: (v) => store.merge('vision', { delegate: v }),
  });
  delegate.node.title = 'Where inference runs';
  const note = el('div', { class: 'dim small keep-3', id: 'vision-note' });

  const sync = () => {
    const v = store.state.vision;
    for (const [key] of FEATURES) buttons[key].classList.toggle('on', v[key]);
    delegate.set(v.delegate);
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
      // Segmentation the engine switched on by itself, for an effect driven
      // by the body.
      const forBody = key === 'segment' && !wanted[key] && v?.forBody;
      const text = STATE_TEXT[f?.state ?? 'loading'] ?? '';
      badges[key].textContent = wanted[key] ? ` ${text}` : forBody ? ` ${text === 'on' ? 'on for the body' : text}` : '';
      if (wanted[key] && f?.state === 'error') errors.push(`${label}: ${f.error}`);
    }
    const usesMask = store.state.chain.some((it) => it.target !== 'all' && !it.bypass);
    const toVision = ui.alertTo?.panel('vision-panel', 'Go to Vision');
    ui.setAlert('mask', status && usesMask && !wanted.segment && !v?.forBody ? 'An effect is set to person / background only, but Segmentation is off — it applies to the whole picture' : null, 'warn', toVision);
    ui.setAlert('vision', errors.length ? `Vision: ${errors.join(' · ')}` : null, 'warn', toVision);
    if (!v?.enabled) {
      note.textContent = 'All off. Each feature costs GPU and CPU time; switch on only what a preset uses.';
      return;
    }
    const delegates = [...new Set(Object.values(v.features).map((f) => f.delegate).filter(Boolean))].join(' + ');
    const input = status.input.kind === 'pattern' ? ' Needs a camera or video input.' : '';
    note.textContent = errors.length ? errors.join(' · ') : v.hz > 0 ? `${v.ms.toFixed(0)} ms per pass · ${v.hz.toFixed(0)} per second${delegates ? ` · ${delegates}` : ''}` : `Waiting for frames.${input}`;
  });

  root.append(
    el('div', { class: 'panel', id: 'vision-panel' }, [el('h2', { text: 'Vision (MediaPipe)' }), grid, el('div', { class: 'row' }, [delegate.node]), note]),
  );
  sync();
}
