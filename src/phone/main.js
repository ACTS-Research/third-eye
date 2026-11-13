// /phone: the iPhone sender. Streams the camera to the Mac and (from Phase 3)
// acts as a motion and touch controller.

import { applyDim, applyPalette } from '../shared/palette.js';
import './phone.css';
import { ANSWER_PREFIX, OFFER_KEY } from '../shared/direct.js';
import { DEFAULT_QUALITY, QUALITY, normalizeRoom, parsePhoneParams } from '../shared/net.js';
import { drawQr } from '../shared/qr.js';
import { el, readJSON, writeJSON } from '../shared/util.js';
import { CameraControls } from './camera-controls.js';
import { SENSOR_HZ } from '../shared/protocol.js';
import { HostLink } from './link.js';
import { enableOffline } from '../shared/offline.js';
import { measure, onOrient, orient, setTurn } from './orient.js';
import { Sensors } from './sensors.js';

const $ = (id) => document.getElementById(id);
const PREFS_KEY = 'thirdeye.phone.v1';

const params = parsePhoneParams();
// The pairing link carries the palette and dimmer chosen on the Mac; once
// paired, the Mac sends any change.
applyPalette(new URLSearchParams(location.search).get('pal'), { save: false });
applyDim(new URLSearchParams(location.search).get('dim'), { save: false });
// `room`: the last room joined, so the page can be reopened without the
// QR code. `turn`: how far the Rotate button has turned the picture.
const prefs = { quality: DEFAULT_QUALITY, facing: 'environment', room: '', turn: 0, ...readJSON(PREFS_KEY, {}) };
if (!QUALITY[prefs.quality]) prefs.quality = DEFAULT_QUALITY;
setTurn(Number(prefs.turn) || 0);

// "Pair without internet" on the Mac puts its half of the handshake in the
// link, after the #. This page answers it and shows its own half as a QR
// code for the Mac's camera.
const offer = new URLSearchParams(location.hash.slice(1)).get(OFFER_KEY);

const app = {
  room: params.room || normalizeRoom(prefs.room),
  signal: params.signal,
  offer,
  byCode: !!offer, // paired by code: a lost link needs a new scan, not a redial
  pairToken: '',
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
  prefs.room = room;
  savePrefs();
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
  $('stage').classList.toggle('off', app.controllerOnly);
  sensors.mountPad($('stage'));
  sensors.mountTriggers($('trigs'));
  sensors.mountPresets($('presets'), (index) => app.link?.send({ t: 'preset', index }));
  layout();

  app.link = new HostLink({
    room: app.room,
    signal: app.signal,
    onChange: renderState,
    onDataOpen: () => {
      sendInfo();
      askForState();
    },
    directFirst: !!offer,
    onMessage: (msg) => {
      if (msg.t === 'presets') greeted = true;
      if (msg.t === 'labels') sensors.setTriggerLabels(msg.triggers ?? [], msg.actions ?? [], msg.on ?? []);
      else if (msg.t === 'presets') sensors.setPresets(msg.names ?? [], msg.current);
      else if (msg.t === 'look') {
        applyPalette(msg.palette, { save: false });
        applyDim(msg.dim, { save: false });
      }
    },
  });
  setInterval(() => app.link.sendSensors(sensors.next()), 1000 / SENSOR_HZ);
  if (app.stream) app.link.setStream(app.stream, QUALITY[prefs.quality]);
  app.link.start();
  requestWakeLock();
  renderState(app.link.state);
  if (offer) showPairCode(offer);
}

// ------------------------------------------------------------- layout ---

// Picks the layout for how the page is turned (phone.css does the rest),
// and turns the preview the way the Rotate button has turned the picture.
function layout() {
  if (!app.started) return;
  measure();
  $('root').classList.toggle('upright', window.innerHeight > window.innerWidth);
  const stage = $('stage');
  stage.style.setProperty('--turn', `${-orient.picture}deg`);
  stage.classList.toggle('turned', orient.picture % 180 !== 0);
  stage.dataset.turn = String(orient.picture);
}
window.addEventListener('resize', layout);
window.addEventListener('orientationchange', layout);
setInterval(layout, 500);
onOrient(() => sendInfo());

$('rotate').addEventListener('click', () => {
  prefs.turn = (orient.picture + 90) % 360;
  savePrefs();
  setTurn(prefs.turn);
  layout();
});

// ------------------------------------------- pairing without internet ---

async function showPairCode(packed) {
  // Normal pairing waits while this phone is pairing by code.
  if (app.link.state.data !== 'open') app.link.directFirst = true;
  try {
    const { token } = await app.link.answerOffer(packed);
    app.pairToken = token;
    drawQr($('pair-qr'), ANSWER_PREFIX + token, { level: 'L', size: 640 });
    $('pair').hidden = false;
    renderState(app.link.state);
  } catch (err) {
    console.warn('[phone] could not answer the offer', err);
    app.link.directFirst = false;
    setNote('The code from the Mac could not be used. Ask for a new one there: Pair without internet.');
  }
}
$('pair-hide').addEventListener('click', () => {
  $('pair').hidden = true;
  if (!app.link || app.link.state.data === 'open') return;
  // Giving up on the code: normal pairing may try again, if it can.
  app.link.directFirst = false;
  app.link.tick();
  setNote('Not paired by code. Trying the pairing server instead; to pair without internet, scan the code on the Mac again.');
});

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
    text: 'Motion',
    title: 'Enable the motion sensors',
    onclick: () => sensors.requestPermission().then((result) => {
      syncMotionAsk();
      if (result === 'denied') setNote('Motion access is blocked. In iOS Settings → Safari, allow Motion & Orientation Access, then reload.');
    }),
  });
  $('rotate').before(button);
}

function cameraErrorText(err) {
  if (!navigator.mediaDevices?.getUserMedia) return 'This page needs HTTPS to use the camera.';
  if (err.name === 'NotAllowedError') return 'Camera access was denied. Allow it in Safari settings for this site, then reload.';
  if (err.name === 'NotFoundError' || err.name === 'OverconstrainedError') return 'No matching camera found.';
  return `Camera error: ${err.message || err.name}`;
}

// Reads the code on the Mac's screen through the camera this page already
// has open, so pairing by code again does not need the Camera app and a new
// tab.
let scanTimer = 0;
let jsQR = null;
const scanFrame = document.createElement('canvas');

function stopScan(note = '') {
  clearInterval(scanTimer);
  scanTimer = 0;
  $('scan').textContent = 'Scan the Mac\'s code';
  setNote(note);
  renderState(app.link?.state);
}

async function startScan() {
  if (scanTimer) return stopScan();
  setPanel(false);
  if (!app.stream) {
    setNote('Turn the camera on first: it is what reads the code on the Mac.');
    return;
  }
  setNote('Point the camera at the code on the Mac (Pair without internet)…', { stay: true });
  try {
    jsQR ??= await import('jsqr').then((m) => m.default ?? m);
  } catch {
    setNote('The code reader could not be loaded.');
    return;
  }
  const video = $('self');
  const until = Date.now() + 60000;
  $('scan').textContent = 'Stop scanning';
  scanTimer = setInterval(() => {
    if (Date.now() > until) return stopScan('No code seen. On the Mac, open Pair without internet, then scan again.');
    if (!video.videoWidth) return;
    const scale = Math.min(1, 960 / video.videoWidth);
    scanFrame.width = Math.round(video.videoWidth * scale);
    scanFrame.height = Math.round(video.videoHeight * scale);
    const ctx = scanFrame.getContext('2d', { willReadFrequently: true });
    ctx.drawImage(video, 0, 0, scanFrame.width, scanFrame.height);
    const image = ctx.getImageData(0, 0, scanFrame.width, scanFrame.height);
    const text = jsQR(image.data, image.width, image.height)?.data ?? '';
    const found = new URLSearchParams(text.split('#')[1] ?? '').get(OFFER_KEY);
    if (!found) return;
    stopScan();
    showPairCode(found);
  }, 250);
  renderState(app.link?.state);
}
$('scan').addEventListener('click', startScan);

// The bar's button: redial, or scan again if this phone was paired by code.
$('reconnect').addEventListener('click', () => {
  if (scanTimer) return stopScan();
  if (app.byCode) startScan();
  else app.link?.restart();
});

// -------------------------------------------------------------- camera ---

const cameraControls = new CameraControls($('adjust'), $('zoom'), (msg) => setNote(msg));

function setPanel(open) {
  $('panel').hidden = !open;
  $('panel-toggle').setAttribute('aria-expanded', String(open));
  $('panel-toggle').classList.toggle('on', open);
}
$('panel-toggle').addEventListener('click', () => setPanel($('panel').hidden));
$('panel-close').addEventListener('click', () => setPanel(false));

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
  layout();
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

// Flip, torch and the white-balance lock are on the live screen, as icons.
$('quick-flip').addEventListener('click', () => flip());
$('quick-torch').addEventListener('click', () => cameraControls.toggleTorch().then(syncTools));
$('quick-wb').addEventListener('click', () => cameraControls.toggleWhiteLock().then(syncTools));

function buildTools() {
  tools.quality = el(
    'select',
    { onchange: () => setQuality(tools.quality.value) },
    Object.entries(QUALITY).map(([key, q]) => el('option', { value: key, text: q.label })),
  );
  tools.camera = el('button', { text: 'Camera', onclick: () => setControllerOnly(!app.controllerOnly) });
  $('tools').replaceChildren(tools.quality, tools.camera);
}

function syncTools() {
  if (!tools.quality) return;
  const camOn = !app.controllerOnly;
  tools.quality.disabled = !camOn;
  tools.quality.value = prefs.quality;
  tools.camera.classList.toggle('on', camOn);
  tools.camera.textContent = camOn ? 'Camera on' : 'Camera off';
  $('quick-flip').disabled = !camOn;
  $('quick-torch').hidden = !camOn || !cameraControls.hasTorch;
  $('quick-torch').classList.toggle('on', cameraControls.torchOn);
  $('quick-wb').hidden = !camOn || !cameraControls.hasWhiteLock;
  $('quick-wb').classList.toggle('on', cameraControls.whiteLocked);
}

// -------------------------------------------------------------- status ---

// Asked again after a moment if the Mac's first messages have not shown up.
let greeted = false;
function askForState() {
  greeted = false;
  app.link?.send({ t: 'hello' });
  setTimeout(() => {
    if (!greeted) app.link?.send({ t: 'hello' });
  }, 1500);
}

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
  if (state.data === 'open') $('pair').hidden = true;
  if (state.direct) app.byCode = true;
  // Offered whenever the link is down: redial, or scan the Mac's code again
  // if that is how this phone was paired.
  $('reconnect').hidden = state.data === 'open' && !scanTimer;
  $('reconnect').textContent = scanTimer ? 'Stop scanning' : app.byCode ? 'Scan code' : 'Reconnect';
  if (!$('pair').hidden) text = 'Show the code to the Mac';
  else if (state.data === 'open') {
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

// A passing message. It lies over the status line and goes after a few
// seconds (or a tap), so it never takes room from the preview. `stay` keeps
// it up until it is replaced or cleared.
let noteTimer = 0;
function setNote(text, { stay = false } = {}) {
  clearTimeout(noteTimer);
  $('note').textContent = text ?? '';
  if (text && !stay) noteTimer = setTimeout(() => setNote(''), 7000);
}
$('note').addEventListener('click', () => setNote(''));

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

// Without internet the page only opens if this phone has kept its copy.
enableOffline().then((state) => {
  $('offline-note').textContent = state === 'ready' ? 'Saved on this phone: this page opens without internet.' : '';
});
