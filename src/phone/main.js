// /phone: the iPhone sender. Streams the camera to the Mac and (from Phase 3)
// acts as a motion and touch controller.

import { applyPalette } from '../shared/palette.js';
import './phone.css';
import { DEFAULT_QUALITY, QUALITY, normalizeRoom, parsePhoneParams } from '../shared/net.js';
import { el, readJSON, writeJSON } from '../shared/util.js';
import { CameraControls } from './camera-controls.js';
import { SENSOR_HZ } from '../shared/protocol.js';
import { HostLink } from './link.js';
import { Sensors } from './sensors.js';

const $ = (id) => document.getElementById(id);
const PREFS_KEY = 'thirdeye.phone.v1';

const params = parsePhoneParams();
// The pairing link carries the palette chosen on the Mac.
applyPalette(new URLSearchParams(location.search).get('pal'), { save: false });
const prefs = { quality: DEFAULT_QUALITY, facing: 'environment', ...readJSON(PREFS_KEY, {}) };
if (!QUALITY[prefs.quality]) prefs.quality = DEFAULT_QUALITY;

const app = {
  room: params.room,
  signal: params.signal,
  started: false,
  controllerOnly: false,
  stream: null,
  track: null,
  link: null,
  wakeLock: null,
  wakeLockOk: false,
  hiddenAt: 0,
  cameraBusy: false,
  cameraError: '',
};
window.thirdEyePhone = app;

const sensors = new Sensors();
app.sensors = sensors;

const savePrefs = () => writeJSON(PREFS_KEY, prefs);

// ---------------------------------------------------------------- join ---

const roomInput = $('room-input');
roomInput.value = app.room;
roomInput.addEventListener('input', () => {
  roomInput.value = normalizeRoom(roomInput.value);
});

$('start').addEventListener('click', start);

async function start() {
  const room = normalizeRoom(roomInput.value);
  if (room.length < 4) {
    $('join-error').textContent = 'Enter the room code shown on the Mac.';
    return;
  }
  app.room = room;
  app.controllerOnly = $('controller-only').checked;
  $('start').disabled = true;
  $('join-error').textContent = '';

  // Both permission requests are issued inside this tap, camera first, with
  // no await in between: iOS refuses a motion prompt once the tap has
  // "expired", which it would have by the time the camera prompt returns.
  const cameraReady = app.controllerOnly ? Promise.resolve() : startCamera();
  const motionReady = sensors.requestPermission();
  try {
    await cameraReady;
  } catch (err) {
    $('start').disabled = false;
    $('join-error').textContent = cameraErrorText(err);
    return;
  }
  motionReady.then(syncMotionAsk);

  app.started = true;
  $('join').hidden = true;
  $('live').hidden = false;
  $('room-label').textContent = app.room;
  buildTools();
  syncTools();
  sensors.mountPad($('perform'));
  sensors.mountTriggers($('perform'));

  app.link = new HostLink({
    room: app.room,
    signal: app.signal,
    onChange: renderState,
    onDataOpen: sendInfo,
    onMessage: (msg) => {
      if (msg.t === 'labels') sensors.setTriggerLabels(msg.triggers ?? []);
    },
  });
  setInterval(() => app.link.sendSensors(sensors.next()), 1000 / SENSOR_HZ);
  if (app.stream) app.link.setStream(app.stream, QUALITY[prefs.quality]);
  app.link.start();
  requestWakeLock();
  renderState(app.link.state);
}

// If the motion prompt was refused or never appeared, offer it again: a tap
// on this button is a fresh gesture.
function syncMotionAsk() {
  let button = $('motion-ask');
  if (sensors.permission !== 'denied') {
    button?.remove();
    return;
  }
  if (button) return;
  button = el('button', {
    id: 'motion-ask',
    text: 'Enable motion sensors',
    onclick: () => sensors.requestPermission().then((result) => {
      syncMotionAsk();
      if (result === 'denied') setNote('Motion access is blocked. In iOS Settings → Safari, allow Motion & Orientation Access, then reload.');
    }),
  });
  $('note').after(button);
}

function cameraErrorText(err) {
  if (!navigator.mediaDevices?.getUserMedia) return 'This page needs HTTPS to use the camera.';
  if (err.name === 'NotAllowedError') return 'Camera access was denied. Allow it in Safari settings for this site, then reload.';
  if (err.name === 'NotFoundError' || err.name === 'OverconstrainedError') return 'No matching camera found.';
  return `Camera error: ${err.message || err.name}`;
}

// -------------------------------------------------------------- camera ---

const cameraControls = new CameraControls($('adjust'), (msg) => setNote(msg));

async function startCamera() {
  const q = QUALITY[prefs.quality];
  stopCamera();
  const stream = await navigator.mediaDevices.getUserMedia({
    audio: false,
    video: {
      facingMode: { ideal: prefs.facing },
      width: { ideal: q.width },
      height: { ideal: q.height },
      frameRate: { ideal: q.fps },
    },
  });
  const track = stream.getVideoTracks()[0];
  track.contentHint = 'motion';
  app.stream = stream;
  app.track = track;
  app.cameraError = '';
  // iOS ends or mutes the track when Safari is backgrounded or interrupted.
  track.addEventListener('ended', () => {
    if (app.track === track) recoverCamera();
  });
  $('self').srcObject = stream;
  $('stage').classList.remove('off');
  cameraControls.attach(track);
  syncTools();
  return stream;
}

function stopCamera() {
  for (const track of app.stream?.getTracks() ?? []) track.stop();
  app.stream = null;
  app.track = null;
  $('self').srcObject = null;
  cameraControls.attach(null);
}

// (Re)opens the camera and hands the new track to the live call.
async function restartCamera() {
  if (app.cameraBusy || app.controllerOnly) return;
  app.cameraBusy = true;
  try {
    await app.link?.detach();
    const stream = await startCamera();
    app.link?.setStream(stream, QUALITY[prefs.quality]);
  } catch (err) {
    app.cameraError = cameraErrorText(err);
  } finally {
    app.cameraBusy = false;
    sendInfo();
    renderState(app.link?.state);
  }
}

function recoverCamera() {
  if (!app.started || app.controllerOnly || document.hidden) return;
  if (app.track?.readyState === 'live' && !app.track.muted) return;
  restartCamera();
}
setInterval(recoverCamera, 2000);

async function setQuality(key) {
  prefs.quality = key;
  savePrefs();
  const q = QUALITY[key];
  if (app.track) {
    try {
      // Cheapest path: retune the running track.
      await app.track.applyConstraints({ width: { ideal: q.width }, height: { ideal: q.height }, frameRate: { ideal: q.fps } });
      app.link?.setStream(app.stream, q);
      sendInfo();
      return;
    } catch {
      /* fall through to a restart */
    }
  }
  restartCamera();
}

function flip() {
  prefs.facing = prefs.facing === 'environment' ? 'user' : 'environment';
  savePrefs();
  restartCamera();
}

async function setControllerOnly(on) {
  app.controllerOnly = on;
  if (on) {
    // Order matters: release the sender first so no black frame is sent.
    await app.link?.detach();
    app.link?.setStream(null);
    stopCamera();
    $('stage').classList.add('off');
  } else {
    await restartCamera();
  }
  syncTools();
  sendInfo();
  renderState(app.link?.state);
}

// --------------------------------------------------------------- tools ---

const tools = {};

function buildTools() {
  tools.flip = el('button', { text: 'Flip', onclick: flip });
  tools.torch = el('button', { text: 'Torch', hidden: true, onclick: () => cameraControls.toggleTorch().then(syncTools) });
  tools.quality = el(
    'select',
    { onchange: () => setQuality(tools.quality.value) },
    Object.entries(QUALITY).map(([key, q]) => el('option', { value: key, text: q.label })),
  );
  tools.camera = el('button', { text: 'Camera', onclick: () => setControllerOnly(!app.controllerOnly) });
  $('tools').replaceChildren(tools.flip, tools.torch, tools.quality, tools.camera);
}

function syncTools() {
  if (!tools.flip) return;
  const camOn = !app.controllerOnly;
  tools.flip.disabled = !camOn;
  tools.quality.disabled = !camOn;
  tools.quality.value = prefs.quality;
  tools.camera.classList.toggle('on', camOn);
  tools.camera.textContent = camOn ? 'Camera on' : 'Camera off';
  tools.torch.hidden = !camOn || !cameraControls.hasTorch;
  tools.torch.classList.toggle('on', cameraControls.torchOn);
}

// -------------------------------------------------------------- status ---

function sendInfo() {
  const settings = app.track?.getSettings?.() ?? {};
  app.link?.send({
    t: 'info',
    info: {
      controllerOnly: app.controllerOnly,
      hidden: document.hidden,
      facing: prefs.facing,
      quality: prefs.quality,
      width: settings.width ?? 0,
      height: settings.height ?? 0,
      fps: settings.frameRate ?? 0,
      wakeLock: app.wakeLockOk,
    },
  });
}

function renderState(state) {
  if (!state || !app.started) return;
  const bar = $('bar');
  let level = 'warn';
  let text = 'Connecting…';
  if (state.data === 'open') {
    if (app.controllerOnly) {
      level = 'good';
      text = 'CONTROLLER — linked';
    } else if (state.media === 'connected') {
      level = 'good';
      text = 'LIVE — streaming to Mac';
    } else {
      text = 'Linked — starting video…';
    }
    if (state.rttMs !== null && level === 'good') text += ` · ${state.rttMs.toFixed(0)} ms`;
  } else if (state.signal === 'lost') {
    level = 'bad';
    text = 'No signaling — check Wi-Fi';
  } else if (state.error) {
    level = 'bad';
    text = state.error;
  }
  if (app.cameraError && !app.controllerOnly) {
    level = 'bad';
    text = app.cameraError;
  }
  bar.className = level;
  $('state').textContent = text;
}

function setNote(text) {
  $('note').textContent = text ?? '';
}

// ---------------------------------------------- wake lock & visibility ---

async function requestWakeLock() {
  try {
    if (!('wakeLock' in navigator)) throw new Error('unsupported');
    app.wakeLock = await navigator.wakeLock.request('screen');
    app.wakeLockOk = true;
    app.wakeLock.addEventListener('release', () => {
      app.wakeLockOk = false;
    });
    setNote('');
  } catch {
    app.wakeLockOk = false;
    setNote('Could not keep the screen awake. Set Auto-Lock to Never in iOS Settings → Display & Brightness.');
  }
  sendInfo();
}

document.addEventListener('visibilitychange', () => {
  if (!app.started) return;
  if (document.hidden) {
    app.hiddenAt = Date.now();
    // Best effort: tell the Mac why the picture is about to freeze, and stop
    // sending before iOS mutes the camera (a muted track sends black).
    sendInfo();
    app.link?.detach();
    return;
  }
  const seconds = Math.max(1, Math.round((Date.now() - app.hiddenAt) / 1000));
  $('warning-text').textContent = `This page was in the background for ${seconds} s. The stream to the Mac stopped during that time. Keep Safari open and in front.`;
  $('warning').hidden = false;
  navigator.vibrate?.([200, 100, 200]);
  requestWakeLock();
  if (app.track?.readyState === 'live' && !app.track.muted) app.link?.setStream(app.stream, QUALITY[prefs.quality]);
  else recoverCamera();
  app.link?.tick();
  sendInfo();
});

$('warning-ok').addEventListener('click', () => {
  $('warning').hidden = true;
});

// Stop double-tap zoom and rubber-banding while performing.
document.addEventListener('gesturestart', (e) => e.preventDefault());
document.addEventListener('dblclick', (e) => e.preventDefault());
