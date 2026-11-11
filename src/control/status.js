import { INPUT_LABELS } from '../shared/state.js';
import { el } from '../shared/util.js';

const INPUT_STATE_TEXT = { live: 'live', stalled: 'STALLED — holding last frame', 'no-signal': 'no signal', paused: 'phone camera off — holding last frame' };

export function mountStatus(root, ui) {
  const pills = document.getElementById('pills');
  const alerts = document.getElementById('alerts');
  const outPill = el('span', { class: 'pill' });
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
      setPill(phonePill, '', 'Phone —');
      for (const key of Object.keys(rows)) if (key !== 'offline') rows[key].textContent = '—';
      for (const key of ['input', 'gl', 'phone', 'build', 'room']) ui.setAlert(key, null);
      return;
    }
    const p0 = status.phone;
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
    ui.setAlert('build', status.build !== __BUILD__ ? 'The output window is running a different version of the app than this page. Reload this page, then use Restart output (Setup → Output).' : null);
    ui.setAlert('room', p0.notice || null);
    ui.setAlert('gl', status.contextLost ? 'Output lost its graphics context — recovering' : null, 'bad');

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
    ui.setAlert('phone', info?.hidden ? 'Phone: Safari is in the background — the camera is paused until it returns' : p.phone === 'silent' ? 'Phone stopped responding — it will reconnect by itself when it can' : null, 'bad');
    ui.setAlert('camera', input.kind === 'camera' && status.camera.state === 'error' ? `Local camera: ${status.camera.error}` : null);
    ui.setAlert('relay', p.route === 'relayed' ? 'Phone video is being relayed, not direct — expect extra latency' : null);
  }

  // Real glass-to-glass measurement: flash the output, time the phone seeing it.
  const testNote = el('div', { class: 'dim small', id: 'latency-note', text: 'Point the phone at the projected output so it fills most of the frame, then measure. The output flashes black and white for about ten seconds.' });
  const testButton = el('button', { id: 'latency-test', text: 'Measure real latency', onclick: () => ui.store.emit('latency-test') });
  ui.onStatus((status) => {
    const t = status?.latencyTest;
    testButton.disabled = !status || t?.state === 'running';
    if (!t || t.state === 'idle') return;
    if (t.state === 'running') testNote.textContent = 'Measuring… the output is flashing.';
    else if (t.state === 'done') testNote.textContent = `Measured ${t.ms.toFixed(0)} ms from the output lighting up to the Mac seeing it (${t.message}). That is the whole loop: projector, camera, phone, network, Mac.`;
    else testNote.textContent = t.message;
  });

  ui.onStatus(update);
  root.append(el('div', { class: 'panel' }, [el('h2', { text: 'Status' }), list, el('div', { class: 'row', style: 'margin-top:10px' }, [testButton]), testNote]));
  update(null);
}
