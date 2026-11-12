// Owns the WebGL context, the render loop and everything that feeds it.
// Runs only in /output.

import { clamp } from '../shared/util.js';
import { AudioInput } from './audio.js';
import { LocalCamera } from './camera.js';
import { MidiInput } from './midi.js';
import { describeAction } from '../shared/actions.js';
import { macroUnit, resolveMacros } from '../shared/macros.js';
import { randomRoom } from '../shared/net.js';
import { TRIGGER_COUNT } from '../shared/protocol.js';
import { InputManager } from './inputs.js';
import { LatencyProbe } from './latency-probe.js';
import { LOOK_KEYS, readLook } from '../shared/look.js';
import { Recorder } from './recorder.js';
import { Modulation } from './modulation.js';
import { PhoneSensors } from './phone-sensors.js';
import { Pipeline } from './pipeline.js';
import { PhoneLink } from './remote.js';
import { Tempo } from './tempo.js';
import { Vision } from './vision.js';

const MAX_EDGE = 4096;
const GLITCH_MS = 450;
const STALL_MS = 1000;
const PREVIEW_INTERVAL_MS = 100;
const STATUS_INTERVAL_MS = 500;
const SOURCES_INTERVAL_MS = 66;
const CONTROL_TIMEOUT_MS = 3000;

export class Engine {
  constructor(canvas, store, bus) {
    this.canvas = canvas;
    this.store = store;
    this.bus = bus;
    this.inputs = new InputManager();
    this.t0 = performance.now();
    this.glitchStart = -1e9;
    this.mod = new Modulation(store);
    this.sensors = new PhoneSensors(this.mod);
    this.resolve = this.mod.resolve;
    this.midi = new MidiInput(this.mod, (source) => this.bus.send('midi-learned', { source }));
    this.audio = new AudioInput(this.mod);
    this.vision = new Vision(this.mod);
    this.tempo = new Tempo(this.mod, store);
    this.recorder = new Recorder(canvas, () => this.audio.stream);
    this.probe = new LatencyProbe(() => (this.lost ? null : this.pipeline.inputBrightness()));
    this.lastSourcesAt = 0;
    this.maskFit = [1, 1, 0, 0];
    this.lost = false;
    this.pixelWidth = 0;
    this.pixelHeight = 0;

    this.renderFrames = 0;
    this.renderFps = 0;
    this.inputFps = 0;
    this.lastInputFrames = 0;
    this.lastStatusAt = performance.now();
    this.lastPreviewAt = 0;
    this.worstFrameMs = 0;
    this.lastFrameAt = 0;

    this.initGL();

    this.camera = new LocalCamera(this.inputs.feeds.camera);
    this.link = new PhoneLink(this.inputs.feeds.phone, () => this.store.state.net, (msg) => this.onPhoneMessage(msg));
    this.link.onData = (conn) => this.sensors.attach(conn);
    this.link.onOpenData = () => {
      this.sendTriggerLabels();
      this.link.send({ t: 'config', codec: this.store.state.net.codec });
      this.link.send({ t: 'look', ...readLook() });
    };
    // Palette and dimmer are set on /control and kept in this browser's
    // storage; a change there fires here, and the phone follows.
    window.addEventListener('storage', (e) => {
      if (e.key === LOOK_KEYS.palette || e.key === LOOK_KEYS.dim) this.link.send({ t: 'look', ...readLook() });
    });
    this.link.getCodec = () => this.store.state.net.codec;
    this.link.onRoomTaken = () => {
      const old = this.store.state.net.room;
      this.link.notice = `Room code ${old} was in use somewhere else, so a new one was made. Scan the QR code again.`;
      this.store.merge('net', { room: randomRoom() });
    };
    this.latency = null;
    setInterval(() => this.housekeeping(), 1000);

    canvas.addEventListener('webglcontextlost', (e) => {
      e.preventDefault();
      this.lost = true;
      console.warn('[engine] WebGL context lost');
    });
    canvas.addEventListener('webglcontextrestored', () => {
      console.warn('[engine] WebGL context restored, rebuilding');
      this.initGL();
      this.lost = false;
    });

    new ResizeObserver((entries) => {
      const entry = entries[0];
      const box = entry.devicePixelContentBoxSize?.[0];
      if (box) {
        this.pixelWidth = box.inlineSize;
        this.pixelHeight = box.blockSize;
      } else {
        this.pixelWidth = Math.round(entry.contentRect.width * devicePixelRatio);
        this.pixelHeight = Math.round(entry.contentRect.height * devicePixelRatio);
      }
      this.applySize();
    }).observe(canvas, { box: 'content-box' });

    store.subscribe((op) => this.onOp(op));
    store.onEvent((name, data) => {
      if (name === 'glitch') this.glitchStart = performance.now();
      else if (name === 'tap') this.tempo.tap(data?.at ?? Date.now());
      else if (name === 'record') this.recorder.toggle(this.store.state.globals.recFormat);
      else if (name === 'latency-test') this.probe.start();
    });
    // /control announces itself; without it nobody is looking at the preview
    // or the meters, so the readback and the broadcasts are skipped.
    this.controlSeenAt = -1e9;
    bus.on('control-alive', () => {
      this.controlSeenAt = performance.now();
    });
    bus.on('midi', (m) => {
      if (m.cmd === 'learn') this.midi.learning = !!m.on;
    });
    bus.on('file', (m) => {
      if (m.file) this.inputs.feeds.file.setBlob(m.file);
      else this.inputs.feeds.file.clear();
    });
  }

  initGL() {
    const gl = this.canvas.getContext('webgl2', {
      alpha: false,
      antialias: false,
      depth: false,
      stencil: false,
      desynchronized: true,
      powerPreference: 'high-performance',
      preserveDrawingBuffer: false,
    });
    if (!gl) throw new Error('WebGL2 is not available');
    this.gl = gl;
    this.inputs.initGL(gl);
    this.vision.initGL(gl);
    this.pipeline = new Pipeline(gl, this.inputs);
    this.inputs.setKind(this.store.state.input.kind);
    this.applySize();
    this.pipeline.setChain(this.store.state.chain, 0, performance.now());
  }

  applySize() {
    if (!this.pixelWidth || !this.pixelHeight) return;
    const scale = clamp(this.store.state.globals.renderScale, 0.25, 1);
    let w = this.pixelWidth * scale;
    let h = this.pixelHeight * scale;
    const over = Math.max(w, h) / MAX_EDGE;
    if (over > 1) {
      w /= over;
      h /= over;
    }
    w = Math.max(16, Math.round(w));
    h = Math.max(16, Math.round(h));
    if (this.canvas.width !== w || this.canvas.height !== h) {
      this.canvas.width = w;
      this.canvas.height = h;
    }
    this.pipeline?.resize(w, h);
  }

  onOp(op) {
    const state = this.store.state;
    switch (op.op) {
      case 'scene':
        this.pipeline.setChain(state.chain, op.fade ?? 0, performance.now());
        break;
      case 'set':
        if (op.key === 'actions') this.sendTriggerLabels();
        break;
      case 'replace':
        this.sendTriggerLabels();
        this.pipeline.setChain(state.chain, 0, performance.now());
        this.inputs.setKind(state.input.kind);
        this.pipeline.srcDirty = true;
        this.applySize();
        this.link.refresh();
        this.housekeeping();
        break;
      case 'merge':
        if (op.key === 'input') {
          this.inputs.setKind(state.input.kind);
          this.pipeline.srcDirty = true;
          this.housekeeping();
        } else if (op.key === 'net') {
          this.link.refresh();
          if ('codec' in op.patch) this.link.send({ t: 'config', codec: state.net.codec });
        } else if (op.key === 'midi' || op.key === 'audio' || op.key === 'vision') {
          this.housekeeping();
        } else if (op.key === 'globals' && 'renderScale' in op.patch) {
          this.applySize();
        }
        break;
      default:
        break;
    }
  }

  // Slow chores that must keep running even if rendering is paused.
  housekeeping() {
    const input = this.store.state.input;
    // Once opened the camera stays warm so switching back to it is instant.
    if (input.kind === 'camera' || this.camera.stream) this.camera.ensure(input.cameraId);

    const { midi, audio } = this.store.state;
    if (midi.enabled) this.midi.enable();
    else if (this.midi.state !== 'off') this.midi.disable();
    if (audio.enabled) this.audio.enable(audio.deviceId);
    else if (this.audio.state !== 'off') this.audio.disable();
    this.vision.configure(this.store.state.vision);
  }

  onPhoneMessage(_msg) {}

  // Where modulation currently has each perform fader's parameter (0..1), so
  // /control can draw it beside the dialled value.
  macroLevels() {
    return resolveMacros(this.store.state).map((macro) => {
      if (!macro) return null;
      const live = this.pipeline.cur.instances.get(macro.fx)?.values[macro.key];
      return live === undefined ? null : Math.round(macroUnit(macro, live) * 1000) / 1000;
    });
  }

  // The phone labels its trigger buttons with whatever they are bound to.
  sendTriggerLabels() {
    const labels = [];
    for (let i = 1; i <= TRIGGER_COUNT; i++) {
      const bound = this.store.state.actions.find((b) => b.source === `trig.${i}`);
      labels.push(bound ? describeAction(bound.action) : `Trigger ${i}`);
    }
    this.link.send({ t: 'labels', triggers: labels });
  }

  start() {
    const tick = (now) => {
      requestAnimationFrame(tick);
      this.frame(now);
    };
    requestAnimationFrame(tick);
  }

  frame(now) {
    if (this.lastFrameAt) this.worstFrameMs = Math.max(this.worstFrameMs, now - this.lastFrameAt);
    this.lastFrameAt = now;

    const dt = Math.min(0.1, (now - (this.prevFrameAt ?? now)) / 1000);
    this.prevFrameAt = now;
    this.sensors.frame(dt, now);
    this.audio.frame(dt, now, this.store.state.audio);
    this.mod.frame(dt, this.tempo.frame(now));
    const watched = now - this.controlSeenAt < CONTROL_TIMEOUT_MS;
    if (watched && now - this.lastSourcesAt >= SOURCES_INTERVAL_MS) {
      this.lastSourcesAt = now;
      this.bus.send('sources', { values: this.mod.snapshot(), macros: this.macroLevels() });
    }

    this.inputs.feeds.phone.gated = this.link.hold;
    this.vision.frame(now, this.inputs.feed?.video ?? null);
    if (!this.lost) {
      const state = this.store.state;
      const g = state.globals;
      // The mask lives in input-frame space: effects need the same fit the
      // source stage applied to line it up with the picture.
      const maskTex = this.vision.maskTexture(now);
      const [fitX, fitY] = this.pipeline.fitScale(state.input.fit);
      this.maskFit[0] = fitX;
      this.maskFit[1] = fitY;
      this.maskFit[2] = state.input.mirror ? 1 : 0;
      this.maskFit[3] = maskTex ? 1 : 0;
      const flash = this.probe.frame(now, 1000 / Math.max(this.renderFps, 30));
      const wantPreview = watched && g.preview && now - this.lastPreviewAt >= PREVIEW_INTERVAL_MS;
      if (wantPreview) this.lastPreviewAt = now;
      try {
        // Collect the previous preview before a new one can be started.
        const preview = this.pipeline.pollPreview();
        if (preview) this.bus.send('preview', preview);
        this.pipeline.render({
          now,
          time: (now - this.t0) / 1000,
          phone: this.sensors.angles,
          maskTex,
          maskFit: this.maskFit,
          glitch: clamp(1 - (now - this.glitchStart) / GLITCH_MS, 0, 1),
          master: g.blackout || flash === 'black' ? 0 : 1,
          flash: flash === 'white' ? 1 : 0,
          bypassAll: g.bypassAll,
          frozen: g.freeze,
          input: state.input,
          resolve: this.resolve,
          canvasWidth: this.canvas.width,
          canvasHeight: this.canvas.height,
          wantPreview,
        });
      } catch (err) {
        // Never let one bad frame stop the show.
        if (!this.renderErrorLogged) console.error('[engine] render failed', err);
        this.renderErrorLogged = true;
      }
      this.renderFrames++;
    }

    if (now - this.lastStatusAt >= STATUS_INTERVAL_MS) this.sendStatus(now);
  }

  inputStatus(now) {
    const { inputs } = this;
    const feed = inputs.feed;
    if (inputs.kind === 'pattern') return { kind: 'pattern', state: 'live', width: this.canvas.width, height: this.canvas.height };
    let state = 'no-signal';
    if (feed.gated && inputs.hasFrame) state = 'paused';
    else if (feed.lastFrameAt && now - feed.lastFrameAt < STALL_MS) state = 'live';
    else if (inputs.kind === 'phone' && this.link.phoneInfo?.controllerOnly && this.link.conn?.open) state = 'paused';
    else if (inputs.hasFrame && feed.lastFrameAt) state = 'stalled';
    return { kind: inputs.kind, state, width: feed.video.videoWidth, height: feed.video.videoHeight };
  }

  sendStatus(now) {
    const dt = (now - this.lastStatusAt) / 1000;
    this.renderFps = this.renderFrames / dt;
    this.renderFrames = 0;
    const feed = this.inputs.feed;
    if (feed) {
      this.inputFps = (feed.frames - this.lastInputFrames) / dt;
      this.lastInputFrames = feed.frames;
    } else {
      this.inputFps = this.renderFps;
      this.lastInputFrames = 0;
    }
    this.lastStatusAt = now;
    this.sensors.takeRate(dt);
    this.vision.takeRate(dt);
    this.updateLatency();
    this.bus.send('status', { status: this.collectStatus(now) });
    this.worstFrameMs = 0;
  }

  // Approximate glass-to-glass delay of the active live input. With a capture
  // timestamp (local cameras; WebRTC once sender reports arrive) it is
  // measured; otherwise it is receive->display plus an allowance for the
  // phone's capture, encode and half the network round trip. Capture takes
  // about one camera frame (waiting for the next exposure, then exposing and
  // reading it out), so the allowance grows at lower frame rates. Checked on
  // a real iPhone, H.264, LAN: 200 ms measured at 30 fps, 167 ms at 60.
  updateLatency() {
    const feed = this.inputs.feed;
    const delay = feed?.takeDelay();
    if (!delay || this.inputs.kind === 'file') {
      this.latency = null;
      return;
    }
    const frameMs = 1000 / Math.max(this.renderFps, 1);
    let ms = delay.ms + frameMs;
    if (!delay.fromCapture) {
      const cameraFrameMs = 1000 / Math.max(this.inputFps, 15);
      ms += 45 + cameraFrameMs + (this.link.stats.rttMs ?? 0) / 2;
    }
    const prev = this.latency?.ms;
    this.latency = { ms: prev ? prev * 0.6 + ms * 0.4 : ms, measured: delay.fromCapture };
  }

  collectStatus(now) {
    return {
      build: __BUILD__,
      latency: this.latency,
      phone: this.link.status(now),
      sensors: this.sensors.status(now),
      midi: this.midi.status(),
      audio: this.audio.status(),
      vision: this.vision.status(),
      recording: this.recorder.status(),
      latencyTest: this.probe.status(),
      camera: this.camera.status(),
      at: Date.now(),
      renderFps: this.renderFps,
      worstFrameMs: this.worstFrameMs,
      width: this.canvas.width,
      height: this.canvas.height,
      contextLost: this.lost,
      fullscreen: !!document.fullscreenElement,
      input: { ...this.inputStatus(now), fps: this.inputFps },
    };
  }
}
