import { INPUT_LABELS } from '../shared/state.js';
import { el } from '../shared/util.js';

const INPUT_STATE_TEXT = { live: 'live', stalled: 'STALLED — holding last frame', 'no-signal': 'no signal', paused: 'phone camera off — holding last frame' };

export function mountStatus(root, ui) {
  const pills = document.getElementById('pills');
  const alerts = document.getElementById('alerts');
  // The first readout says where the picture is drawn and how fast. With no
  // output window it is calm, and a click opens one.
  const outPill = el('span', { class: 'pill', id: 'out-pill', role: 'button', tabindex: '0' });
  const outClick = () => {
    if (ui.host?.role !== 'output') ui.openOutput?.();
  };
  outPill.addEventListener('click', outClick);
  outPill.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') outClick();
  });
  const inPill = el('span', { class: 'pill' });
  // Clicking the input or phone status opens the pairing details below it.
  const pairing = (pill) => {
    pill.tabIndex = 0;
    pill.setAttribute('role', 'button');
    pill.title = 'Show the QR code and connection details';
    pill.addEventListener('click', () => ui.togglePairing?.(pill));
    pill.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') ui.togglePairing?.(pill);
    });
  };
  const phonePill = el('span', { class: 'pill' });
  pairing(inPill);
  pairing(phonePill);
  pills.append(outPill, inPill, phonePill);

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
  row('latency', 'Latency');
  row('phone', 'Phone');
  row('link', 'Link');
  row('stream', 'Stream');
  row('sensors', 'Sensors');
  row('offline', 'Offline');

  // Other modules add their own rows / pills / alerts through these.
  ui.statusRow = row;
  ui.statusRows = rows;
  ui.addPill = () => {
    const p = el('span', { class: 'pill' });
    pills.append(p);
    return p;
  };
  // Alerts: one strip each. A strip with a fix is a button that goes there
  // (`action: { label, run }`); every strip has an × on the right. A closed
  // strip stays closed until its message changes or it clears and returns.
  // Strips that describe a passing state remove themselves when it passes.
  const alertNodes = new Map();
  const dismissed = new Map(); // key -> the text that was closed
  ui.setAlert = (key, text, level = 'warn', action = null) => {
    let node = alertNodes.get(key);
    if (!text || dismissed.get(key) === text) {
      if (!text) dismissed.delete(key);
      node?.remove();
      alertNodes.delete(key);
      return;
    }
    dismissed.delete(key);
    if (!node) {
      node = el('div', { role: 'alert' });
      node.dataset.key = key;
      alertNodes.set(key, node);
      alerts.append(node);
    }
    if (node.dataset.text === text && node.dataset.level === level && node.dataset.action === (action?.label ?? '')) return;
    node.dataset.text = text;
    node.dataset.level = level;
    node.dataset.action = action?.label ?? '';
    node.className = `alert ${level}${action ? ' fix' : ''}`;
    const close = el('button', {
      class: 'close',
      text: '×',
      title: 'Close this message',
      'aria-label': 'Close this message',
      onclick: (e) => {
        e.stopPropagation();
        dismissed.set(key, text);
        node.remove();
        alertNodes.delete(key);
      },
    });
    const body = action
      ? el('button', { class: 'go', title: action.label, onclick: () => action.run() }, [el('span', { class: 'text', text }), el('span', { class: 'act', text: `${action.label} →` })])
      : el('span', { class: 'text', text });
    node.replaceChildren(body, close);
  };

  // Where alerts send the operator.
  const showPairing = { label: 'Show pairing', run: () => ui.togglePairing?.(phonePill) };
  ui.alertTo = {
    pairing: showPairing,
    qr: { label: 'Show QR code', run: () => ui.togglePairing?.(phonePill) },
    reload: { label: 'Reload both pages', run: () => ui.reloadBoth() },
    panel: (id, label) => ({ label, run: () => ui.goToPanel(id) }),
  };

  const setPill = (pill, level, text) => {
    pill.className = `pill ${level}`;
    pill.textContent = text;
  };

  function update(status) {
    if (!status) {
      // Between hosts for a moment, or an output window that is not drawing.
      const h = ui.host;
      if (h?.stalled) setPill(outPill, 'bad', 'Output not drawing');
      else if (h?.state === 'failed') setPill(outPill, 'bad', 'No picture');
      else setPill(outPill, '', h?.state === 'remote' ? 'Output …' : 'Starting…');
      outPill.title = '';
      setPill(inPill, '', 'Input —');
      setPill(phonePill, '', 'Phone —');
      for (const key of Object.keys(rows)) if (key !== 'offline') rows[key].textContent = '—';
      for (const key of ['input', 'gl', 'phone', 'build', 'room']) ui.setAlert(key, null);
      return;
    }
    const p0 = status.phone;
    const fps = status.renderFps;
    const inOutput = status.host?.role === 'output';
    const slow = fps > 50 ? '' : fps > 24 ? 'warn' : 'bad';
    if (inOutput) {
      setPill(outPill, slow || 'good', `Output ${fps.toFixed(0)} fps`);
      outPill.title = 'The output window draws the picture';
    } else {
      setPill(outPill, slow, `Output off · ${fps.toFixed(0)} fps`);
      outPill.title = 'No output window: the picture runs on this page. Click to open the output window.';
    }
    rows.render.textContent = `${fps.toFixed(1)} fps · worst ${status.worstFrameMs.toFixed(0)} ms`;
    rows.size.textContent = `${status.width}×${status.height}${inOutput ? (status.fullscreen ? ' fullscreen' : ' windowed') : ' on this page'}`;

    const input = status.input;
    const label = INPUT_LABELS[input.kind] ?? input.kind;
    setPill(inPill, input.state === 'live' ? 'good' : input.state === 'stalled' ? 'bad' : 'warn', `${label}: ${INPUT_STATE_TEXT[input.state] ?? input.state}`);
    rows.input.textContent = input.width ? `${label} ${input.width}×${input.height}` : label;
    rows.inputFps.textContent = `${input.fps.toFixed(1)} fps`;

    const stallFix = input.kind === 'phone' ? ui.alertTo.pairing : ui.alertTo.panel('input-panel', 'Go to Input');
    ui.setAlert('input', input.state === 'stalled' ? `${label} stalled — holding the last frame` : null, 'bad', stallFix);
    ui.setAlert('build', inOutput && status.build !== __BUILD__ ? 'The output window runs a different version of the app than this page. Reloading exits fullscreen.' : null, 'warn', ui.alertTo.reload);
    ui.setAlert('room', p0.notice || null, 'warn', ui.alertTo.qr);
    ui.setAlert('gl', status.contextLost ? 'The picture lost its graphics context — recovering' : null, 'bad');

    const lat = status.latency;
    rows.latency.textContent = lat ? `${lat.measured ? '' : '≈ '}${lat.ms.toFixed(0)} ms` : '—';

    const p = status.phone;
    const info = p.info;
    let phoneText = 'not paired';
    let phoneLevel = 'warn';
    if (p.phone === 'connected') {
      phoneLevel = 'good';
      phoneText = info?.controllerOnly ? 'controller only' : p.media === 'connected' ? 'streaming' : 'paired, no video yet';
      if (info?.hidden) {
        phoneLevel = 'bad';
        phoneText = 'PAGE IN BACKGROUND';
      }
    } else if (p.phone === 'silent') {
      phoneLevel = 'bad';
      phoneText = 'not responding';
    } else if (p.signal === 'error') {
      phoneLevel = 'bad';
      phoneText = 'room code in use elsewhere';
    } else if (p.signal !== 'open') {
      phoneLevel = p.signal === 'connecting' ? 'warn' : 'bad';
      phoneText = p.signal === 'connecting' ? 'connecting…' : 'pairing server unreachable';
    }
    setPill(phonePill, phoneLevel, `Phone: ${phoneText}`);
    rows.phone.textContent = phoneText;
    rows.link.textContent = p.media === 'connected' ? [p.route, p.rttMs !== undefined ? `${p.rttMs.toFixed(0)} ms rtt` : ''].filter(Boolean).join(' · ') : '—';
    rows.stream.textContent =
      p.media === 'connected' && p.kbps !== undefined
        ? [p.codec, p.hardware === true ? 'hardware' : p.hardware === false ? 'software' : '', `${(p.kbps / 1000).toFixed(1)} Mbps`, p.jitterBufferMs !== undefined ? `buffer ${p.jitterBufferMs.toFixed(0)} ms` : ''].filter(Boolean).join(' · ')
        : '—';
    const sn = status.sensors;
    rows.sensors.textContent = sn?.live ? `${sn.hz.toFixed(0)} Hz${sn.orientation ? '' : ' · no orientation'}${sn.motion ? '' : ' · no motion'}` : '—';
    ui.setAlert('phone', info?.hidden ? 'Phone: Safari is in the background — the camera is paused until it returns' : p.phone === 'silent' ? 'Phone stopped responding — it will reconnect by itself when it can' : null, 'bad', ui.alertTo.pairing);
    ui.setAlert('camera', input.kind === 'camera' && status.camera.state === 'error' ? `Local camera: ${status.camera.error}` : null, 'warn', ui.alertTo.panel('input-panel', 'Go to Input'));
    ui.setAlert('relay', p.route === 'relayed' ? 'Phone video is being relayed, not direct — expect extra latency' : null);
  }

  // Real glass-to-glass measurement: flash the output, time the phone seeing it.
  const testNote = el('div', { class: 'dim small keep-3', id: 'latency-note', text: 'Point the phone at the projected output (or, with no output window, at the monitor on the Perform screen) so it fills most of the frame, then measure. The picture flashes black and white for about ten seconds.' });
  const testButton = el('button', { id: 'latency-test', text: 'Measure real latency', onclick: () => ui.store.emit('latency-test') });
  ui.onStatus((status) => {
    const t = status?.latencyTest;
    testButton.disabled = !status || t?.state === 'running';
    if (!t || t.state === 'idle') return;
    if (t.state === 'running') testNote.textContent = 'Measuring… the picture is flashing.';
    else if (t.state === 'done') testNote.textContent = `Measured ${t.ms.toFixed(0)} ms, output to Mac: ${t.message}.`;
    else testNote.textContent = t.message;
  });

  ui.onStatus(update);
  ui.onHost(() => {
    if (!ui.engineAlive) update(null);
  });
  root.append(el('div', { class: 'panel' }, [el('h2', { text: 'Status' }), list, el('div', { class: 'row', style: 'margin-top:10px' }, [testButton]), testNote]));
  update(null);
}
