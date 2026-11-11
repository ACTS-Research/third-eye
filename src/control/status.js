import { INPUT_LABELS } from '../shared/state.js';
import { el } from '../shared/util.js';

const INPUT_STATE_TEXT = { live: 'live', stalled: 'STALLED — holding last frame', 'no-signal': 'no signal' };

export function mountStatus(root, ui) {
  const pills = document.getElementById('pills');
  const alerts = document.getElementById('alerts');
  const outPill = el('span', { class: 'pill' });
  const inPill = el('span', { class: 'pill' });
  pills.append(outPill, inPill);

  const rows = {};
  const list = el('dl', { class: 'stats' });
  const row = (key, label) => {
    rows[key] = el('dd', { text: '—' });
    list.append(el('dt', { text: label }), rows[key]);
  };
  row('render', 'Render');
  row('size', 'Output size');
  row('input', 'Input');
  row('inputFps', 'Incoming');

  // Other modules add their own rows / pills / alerts through these.
  ui.statusRow = row;
  ui.statusRows = rows;
  ui.addPill = () => {
    const p = el('span', { class: 'pill' });
    pills.append(p);
    return p;
  };
  const alertNodes = new Map();
  ui.setAlert = (key, text, level = 'warn') => {
    let node = alertNodes.get(key);
    if (!text) {
      node?.remove();
      alertNodes.delete(key);
      return;
    }
    if (!node) {
      node = el('div');
      alertNodes.set(key, node);
      alerts.append(node);
    }
    node.className = `alert ${level}`;
    node.textContent = text;
  };

  const setPill = (pill, level, text) => {
    pill.className = `pill ${level}`;
    pill.textContent = text;
  };

  function update(status) {
    if (!status) {
      setPill(outPill, 'bad', 'Output closed');
      setPill(inPill, '', 'Input —');
      for (const key of Object.keys(rows)) rows[key].textContent = '—';
      ui.setAlert('input', null);
      return;
    }
    const fps = status.renderFps;
    setPill(outPill, fps > 50 ? 'good' : fps > 24 ? 'warn' : 'bad', `Output ${fps.toFixed(0)} fps`);
    rows.render.textContent = `${fps.toFixed(1)} fps · worst ${status.worstFrameMs.toFixed(0)} ms`;
    rows.size.textContent = `${status.width}×${status.height}${status.fullscreen ? ' fullscreen' : ' windowed'}`;

    const input = status.input;
    const label = INPUT_LABELS[input.kind] ?? input.kind;
    setPill(inPill, input.state === 'live' ? 'good' : input.state === 'stalled' ? 'bad' : 'warn', `${label}: ${INPUT_STATE_TEXT[input.state] ?? input.state}`);
    rows.input.textContent = input.width ? `${label} ${input.width}×${input.height}` : label;
    rows.inputFps.textContent = `${input.fps.toFixed(1)} fps`;

    ui.setAlert('input', input.state === 'stalled' ? `${label} stalled — output is holding the last frame` : null, 'bad');
    ui.setAlert('gl', status.contextLost ? 'Output lost its graphics context — recovering' : null, 'bad');
  }

  ui.onStatus(update);
  root.append(el('div', { class: 'panel' }, [el('h2', { text: 'Status' }), list]));
  update(null);
}
