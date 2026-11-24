// Owns the WebGL context, the render loop and everything that feeds it.
// One engine runs per browser: in /output while an output window is open,
// otherwise in /control (src/control/host.js decides). start() and stop() can
// be called again and again; a stopped engine holds no room code, no devices
// and no recording, and ignores the store until it is started again.

import { clamp } from '../shared/util.js';
import { AudioInput } from './audio.js';
import { LocalCamera } from './camera.js';
import { MidiInput } from './midi.js';
import { TOGGLE_ACTIONS, describeAction } from '../shared/actions.js';
import { PRESETS_KEY, SHOWS_KEY, applyPreset, applyStep, loadPresets, orderView } from '../shared/presets.js';
import { paramUnit } from '../effects/index.js';
import { macroUnit, resolveMacros } from '../shared/macros.js';
import { randomRoom, roomB } from '../shared/net.js';
import { TRIGGER_COUNT } from '../shared/protocol.js';
import { InputManager } from './inputs.js';
import { LatencyProbe } from './latency-probe.js';
import { LOOK_KEYS, readLook } from '../shared/look.js';
import { Recorder } from './recorder.js';
import { ReturnFeed } from './return-feed.js';
import { Modulation } from './modulation.js';
import { PhoneSensors } from './phone-sensors.js';
import { GlitchJump } from './glitch.js';
import { MotionSources } from './motion.js';
import { Pipeline } from './pipeline.js';
import { PhoneLink } from './remote.js';
import { Tempo } from './tempo.js';
import { Vision } from './vision.js';

// When a phone last paired in this browser (any window). While that is
// recent the room code is never changed without being asked: see
// onRoomTaken.
const PAIRED_KEY = 'thirdeye.pairedAt';
const PAIRED_LATELY_MS = 12 * 3600 * 1000;
function notePaired() {
  try {
    localStorage.setItem(PAIRED_KEY, String(Date.now()));
  } catch {
    /* private window: the code may then change as before */
  }
}
function pairedLately() {
  try {
    return Date.now() - Number(localStorage.getItem(PAIRED_KEY) || 0) < PAIRED_LATELY_MS;
  } catch {
    return false;
  }
}

// How many buttons the phone has for presets or steps.
const PHONE_BANK = 6;

const MAX_EDGE = 4096;
const GLITCH_MS = 450;
const STALL_MS = 1000;
const PREVIEW_INTERVAL_MS = 100;
const STATUS_INTERVAL_MS = 500;
const SOURCES_INTERVAL_MS = 66;
// The small views of inputs A and B on the perform screen.
const THUMBS_INTERVAL_MS = 200;
// Segmentation stays on this long after the last effect driven by the body
// goes, so that stepping through presets does not reload the model.
const BODY_LINGER_MS = 10000;
const CONTROL_TIMEOUT_MS = 3000;

export class Engine {
  // role: 'output' or 'control', the page hosting this engine; id tells two
  // hosts apart. size: { width, height } renders at a fixed size instead of
  // following the canvas element (the monitor on /control).
  constructor(canvas, store, bus, { role = 'output', id = '', size = null } = {}) {
    this.canvas = canvas;
    this.store = store;
    this.bus = bus;
    this.host = { role, id };
    this.running = false;
    this.raf = 0;
    this.inputs = new InputManager();
    this.t0 = performance.now();
    this.glitchStart = -1e9;
    this.mod = new Modulation(store);
    this.motion = new MotionSources(this.mod);
    this.motionWanted = { A: false, B: false };
    // Segmentation switched on for an effect driven by the body.
    this.forBody = false;
    this.bodyWantedAt = -Infinity;
    this.sensors = new PhoneSensors(this.mod);
    // The second iPhone's motion and touch pad: sources of their own.
    this.sensorsB = new PhoneSensors(this.mod, 'B');
    // Glitch as a jump of chosen sliders, applied on top of modulation.
    this.glitchJump = new GlitchJump();
    this.resolve = (item, inst) => {
      this.mod.resolveInto(item, inst);
      this.glitchJump.apply(item, inst);
    };
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
    this.lastThumbsAt = 0;
    // Sources the perform screen is pointing at: shown in the small views
    // without being chosen. { a: kind | '', b: kind | '' }
    this.peek = { a: '', b: '' };
    // Stand-by: when each input's source was last seen sending, and how far
    // the stand-by has faded in over A (0..1) and B has eased out (0..1).
    this.goodAt = { a: 0, b: 0 };
    this.cover = { a: 0, b: 0 };
    this.worstFrameMs = 0;
    this.lastFrameAt = 0;

    this.initGL();

    this.camera = new LocalCamera(this.inputs.feeds.camera);
    // The links open in start(): until then no room code is taken. Each
    // phone has a link of its own, under its own room code (the second
    // phone's is roomB), so neither knows of the other and one dropping or
    // reconnecting never disturbs the other. The second is only opened while
    // net.second is on.
    const wire = (link, sensors) => {
      link.onData = (conn) => sensors.attach(conn);
      link.onOpenData = () => {
        // A phone on the room code clears the "scan again" notice.
        this.link.notice = '';
        this.link.keepingRoom = false;
        notePaired();
        // Which run of which engine this is. When the picture moves between
        // /control and the output window the phone sees a new one, and calls
        // again at once instead of waiting to notice its old call went dead.
        link.send({ t: 'host', session: this.session });
        this.greetPhone(link);
      };
      link.getCodec = () => this.store.state.net.codec;
      link.getReturnStream = () => this.returnFeed.stream;
      link.onRoomTaken = () => {
        const old = this.store.state.net.room;
        // A phone has paired on this code lately: a new code would strand
        // it, with no way back but a scan at the Mac. Keep trying the old
        // one and leave the choice to the operator.
        if (pairedLately()) {
          this.link.keepingRoom = true;
          this.link.notice = `Room code ${old} reads as in use somewhere else. Still trying it, because a phone has paired on it: a new code would make the phone scan again. For a new one anyway, press New room code.`;
          return;
        }
        this.link.notice = `Room code ${old} was in use somewhere else, so a new one was made. Scan the QR code again.`;
        this.store.merge('net', { room: randomRoom() });
      };
      return link;
    };
    this.link = wire(new PhoneLink(this.inputs.feeds.phone, () => this.store.state.net, (msg) => this.onPhoneMessage(msg, this.link)), this.sensors);
    this.linkB = wire(new PhoneLink(this.inputs.feeds.phone2, () => ({ ...this.store.state.net, room: roomB(this.store.state.net.room) }), (msg) => this.onPhoneMessage(msg, this.linkB)), this.sensorsB);
    this.linkB.isSecond = true;
    this.links = [this.link, this.linkB];
    // Palette and dimmer are set on /control and kept in this browser's
    // storage; a change there fires here, and the phone follows. (No storage
    // event reaches the window that made the change: when /control hosts the
    // engine it calls sendLook() itself.)
    window.addEventListener('storage', (e) => {
      if (e.key === LOOK_KEYS.palette || e.key === LOOK_KEYS.dim) this.sendLook();
      // Presets edited in /control (another window): the phone's row follows.
      else if (e.key === PRESETS_KEY || e.key === SHOWS_KEY) this.sendPresets();
    });
    // The finished picture, small, for a phone that asks to see it.
    this.returnFeed = new ReturnFeed(canvas);
    this.latency = null;
    setInterval(() => {
      if (this.running) this.housekeeping();
    }, 1000);

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

    if (size) {
      this.pixelWidth = size.width;
      this.pixelHeight = size.height;
      this.applySize();
    } else {
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
    }

    store.subscribe((op) => {
      if (this.running) this.onOp(op);
    });
    store.onEvent((name, data) => {
      if (!this.running) return;
      if (name === 'glitch') {
        // The preset's own jump, or with none set the tearing of the picture.
        if (!this.glitchJump.trigger(this.store.state.glitch)) this.glitchStart = performance.now();
      } else if (name === 'glitch-end') this.glitchJump.release();
      else if (name === 'tap') this.tempo.tap(data?.at ?? Date.now());
      else if (name === 'record') this.recorder.toggle(this.store.state.globals.recFormat);
      else if (name === 'latency-test') this.probe.start();
    });
    // /control announces itself; without it nobody is looking at the preview
    // or the meters, so the readback and the broadcasts are skipped. A
    // control page in another window needs the small readback picture; the
    // page hosting this engine shows the canvas itself and does not.
    this.controlSeenAt = -1e9;
    this.remoteControlSeenAt = -1e9;
    bus.on('control-alive', (_m, local) => {
      this.controlSeenAt = performance.now();
      if (!local) this.remoteControlSeenAt = this.controlSeenAt;
    });
    bus.on('peek', (m) => {
      this.peek = { a: m.a || '', b: m.b || '' };
      // Show it at once, not at the next turn of the small views.
      this.lastThumbsAt = 0;
    });
    bus.on('midi', (m) => {
      if (m.cmd === 'learn' && this.running) this.midi.learning = !!m.on;
    });
    bus.on('file', (m) => {
      if (m.file) this.inputs.feeds.file.setBlob(m.file);
      else this.inputs.feeds.file.clear();
    });
    // Pairing without the pairing server: /control asks for an offer, shows
    // it as a QR code, and passes back the code it reads off the phone.
    bus.on('pair-offer', async (m) => {
      if (!this.running) return;
      try {
        const made = await this.link.makeOffer(this.store.state.net.codec);
        this.bus.send('pair-offer-ready', { req: m.req, ...made });
      } catch (err) {
        this.bus.send('pair-error', { req: m.req, message: `Could not prepare a code: ${err.message ?? err}` });
      }
    });
    bus.on('pair-answer', async (m) => {
      if (!this.running) return;
      try {
        await this.link.acceptAnswer(m.token);
        this.bus.send('pair-accepted', {});
      } catch (err) {
        this.bus.send('pair-error', { message: err.stale ? err.message : 'That code could not be used. Scan the code on the Mac again with the phone.' });
      }
    });
    bus.on('pair-cancel', () => {
      if (this.running) this.link.dropPending();
    });
    // Introductions (see PhoneLink.relay): another window's offer for the
    // phone, and the phone's answer on its way back to that window.
    bus.on('intro', (m) => {
      if (m.from !== this.host.id) this.link.relay({ t: 'intro', from: m.from, offer: m.offer });
    });
    bus.on('intro-answer', (m) => {
      if (m.to === this.host.id) this.link.acceptAnswer(m.token).catch((err) => console.warn('[engine] introduction failed', err));
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
    this.setInputs();
    this.applySize();
    this.pipeline.setChain(this.store.state.chain, 0, performance.now());
  }

  // Whether an input's source has stopped sending for longer than the
  // operator allows (input.dropAfter). The test pattern never drops.
  dropped(slot, key, now) {
    if (!slot.kind || slot.kind === 'pattern') return false;
    const feed = slot.feed;
    if (feed?.ready && !feed.gated && now - feed.lastFrameAt < 600) this.goodAt[key] = now;
    return now - this.goodAt[key] > this.store.state.input.dropAfter * 1000;
  }

  // Moves the two stand-by fades toward where they should be.
  updateCover(dt, now) {
    const { dropA, dropB, dropFade } = this.store.state.input;
    const step = dropFade > 0 ? dt / dropFade : 1;
    const wantA = this.dropped(this.inputs, 'a', now) && dropA !== 'hold' ? 1 : 0;
    const wantB = this.dropped(this.inputs.b, 'b', now) && dropB !== 'hold' ? 1 : 0;
    this.cover.a = clamp(this.cover.a + Math.sign(wantA - this.cover.a) * step, 0, 1);
    this.cover.b = clamp(this.cover.b + Math.sign(wantB - this.cover.b) * step, 0, 1);
    // (A step can overshoot a target of 0 or 1 by less than itself.)
    if (Math.abs(wantA - this.cover.a) < step) this.cover.a = wantA;
    if (Math.abs(wantB - this.cover.b) < step) this.cover.b = wantB;
  }

  // Which sources inputs A and B show, from the store.
  setInputs() {
    const { kind, kindB } = this.store.state.input;
    // A newly chosen source gets the full wait before it counts as dropped.
    const now = performance.now();
    if (kind !== this.inputs.kind) this.goodAt.a = now;
    if ((kindB || '') !== this.inputs.b.kind) this.goodAt.b = now;
    this.inputs.setKinds(kind, kindB);
    if (this.pipeline) {
      this.pipeline.srcDirty = true;
      this.pipeline.srcBDirty = true;
    }
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

  // Takes everything from the store again: after a full sync, and when a
  // stopped engine starts and has missed whatever changed meanwhile.
  resync() {
    const state = this.store.state;
    this.sendTriggerLabels();
    this.sendPresets();
    this.pipeline.setChain(state.chain, 0, performance.now());
    this.setInputs();
    this.mod.dirty = true;
    this.applySize();
    this.refreshLinks();
    this.housekeeping();
  }

  onOp(op) {
    const state = this.store.state;
    switch (op.op) {
      case 'scene':
        this.pipeline.setChain(state.chain, op.fade ?? 0, performance.now());
        this.sendPresets();
        break;
      case 'presetIndex':
        this.sendPresets();
        break;
      case 'set':
        if (op.key === 'actions') this.sendTriggerLabels();
        break;
      case 'replace':
        this.resync();
        break;
      case 'merge':
        if (op.key === 'input') {
          this.setInputs();
          this.housekeeping();
        } else if (op.key === 'net') {
          if ('room' in op.patch && this.link.keepingRoom) {
            this.link.keepingRoom = false;
            this.link.notice = '';
          }
          this.refreshLinks();
          if ('codec' in op.patch) this.sendPhones({ t: 'config', codec: state.net.codec });
        } else if (op.key === 'midi' || op.key === 'audio' || op.key === 'vision') {
          this.housekeeping();
        } else if (op.key === 'order') {
          this.sendPresets();
        } else if (op.key === 'globals') {
          if ('renderScale' in op.patch) this.applySize();
          if (Object.keys(TOGGLE_ACTIONS).some((key) => key in op.patch)) this.sendTriggerLabels();
        }
        break;
      default:
        break;
    }
  }

  // Slow chores that must keep running even if rendering is paused.
  housekeeping() {
    // No phone, nobody to draw the return picture for; a phone that comes
    // back asks again.
    for (const link of this.links) if (!link.conn?.open) link.wantsPreview = false;
    // The code is no longer taken: the "still trying it" notice has done.
    if (this.link.keepingRoom && this.links.every((l) => l.stopped || l.signal === 'open')) {
      this.link.keepingRoom = false;
      this.link.notice = '';
    }
    this.returnFeed.on = this.links.some((link) => link.wantsPreview);
    const input = this.store.state.input;
    // Once opened the camera stays warm so switching back to it is instant.
    if (input.kind === 'camera' || input.kindB === 'camera' || input.dropA === 'camera' || this.camera.stream) this.camera.ensure(input.cameraId);

    const { midi, audio } = this.store.state;
    if (midi.enabled) this.midi.enable();
    else if (this.midi.state !== 'off') this.midi.disable();
    if (audio.enabled) this.audio.enable(audio.deviceId);
    else if (this.audio.state !== 'off') this.audio.disable();
    this.vision.configure(this.visionSettings());
  }

  // Setup → Vision, with segmentation on while an effect is driven by the
  // body (Time, Scan: "driven by: The body").
  visionSettings() {
    const v = this.store.state.vision;
    return this.forBody && !v.segment ? { ...v, segment: true } : v;
  }

  // Called each drawn frame: whether the pipeline drew anything driven by
  // the body decides whether segmentation runs for it.
  followBody(now) {
    if (this.pipeline.wantsBody) this.bodyWantedAt = now;
    const forBody = now - this.bodyWantedAt < BODY_LINGER_MS;
    if (forBody === this.forBody) return;
    this.forBody = forBody;
    this.vision.configure(this.visionSettings());
  }

  // Everything a phone needs to draw its screen. Sent when its link opens,
  // and again whenever the phone asks (`hello`), so a phone that missed the
  // first lot is never left with blank buttons.
  greetPhone(link = null) {
    this.sendTriggerLabels();
    this.sendPresets();
    // (`second` lets the second phone's page say that it is phone B.)
    for (const l of link ? [link] : this.links) l.send({ t: 'config', codec: this.store.state.net.codec, second: l === this.linkB });
    this.sendLook();
  }

  // To every paired phone. (A link with no phone on it sends nothing.)
  sendPhones(msg) {
    for (const link of this.links) link.send(msg);
  }

  // Follows the room code and pairing server, and opens or closes the
  // second phone's link as net.second says.
  refreshLinks() {
    this.link.refresh();
    if (!this.store.state.net.second) this.linkB.shutdown();
    else if (this.linkB.stopped) this.linkB.resume();
    else this.linkB.refresh();
  }

  onPhoneMessage(msg, link = this.link) {
    if (msg?.t === 'hello') return this.greetPhone(link);
    // A phone's preview shows the Mac's output, or stopped showing it.
    if (msg?.t === 'preview') {
      link.wantsPreview = !!msg.on;
      this.returnFeed.on = this.links.some((l) => l.wantsPreview);
    }
    if (msg?.t === 'intro-answer') this.bus.send('intro-answer', { to: msg.to, token: msg.token });
    // One of the six buttons on the phone: a step of the running order when
    // that is what the phone was showing, a preset otherwise. (If the two
    // disagree the list changed under the phone's thumb: show it again. A
    // phone page from before the running order does not say which; it is
    // showing whatever was sent last, so take that.)
    else if (msg?.t === 'preset' && Number.isInteger(msg.index) && this.running) {
      const steps = orderView(this.store.state).steps.length > 0;
      if ((msg.order ?? steps) !== steps) this.sendPresets();
      // (A phone page from before the buttons followed the order counts
      // from the first button it was shown.)
      else if (steps) applyStep(this.store, msg.abs ? msg.index : msg.index + (this.bankStart ?? 0));
      else applyPreset(this.store, msg.index);
    }
  }

  // The phone shows six buttons. With a running order they are the steps
  // around where the show is, moving as it moves, so the next step is always
  // under the thumb: the step before the one the order is at, that one, and
  // the four after it. (Six steps or fewer all fit and never move.) Without
  // a running order they are the first six presets.
  sendPresets() {
    const presets = loadPresets();
    const { steps, cue, live, next } = orderView(this.store.state, presets);
    if (steps.length) {
      const start = steps.length > PHONE_BANK ? Math.max(0, cue - 1) : 0;
      this.bankStart = start;
      const at = (i) => (i >= start && i < start + PHONE_BANK ? i - start : -1);
      this.sendPhones({ t: 'presets', order: true, start, names: steps.slice(start, start + PHONE_BANK).map((s) => s.name), current: at(live), next: at(next) });
    } else {
      this.bankStart = 0;
      this.sendPhones({ t: 'presets', order: false, start: 0, names: presets.map((p) => p.name), current: this.store.state.presetIndex, next: -1 });
    }
  }

  // The phone's Rotate button turns the picture a quarter turn at a time.
  updateTurn() {
    const { turns } = this.inputs;
    if (turns.phone === this.sensors.turn && turns.phone2 === this.sensorsB.turn) return;
    turns.phone = this.sensors.turn;
    turns.phone2 = this.sensorsB.turn;
    this.pipeline.srcDirty = true;
    this.pipeline.srcBDirty = true;
  }

  // Asks whichever window has the phone on a direct link to introduce this
  // (stopped) engine, so it has a link of its own ready when it starts.
  async prepareSpare() {
    if (this.running) return;
    try {
      const made = await this.link.makeOffer(this.store.state.net.codec);
      this.bus.send('intro', { from: this.host.id, offer: made.offer });
    } catch (err) {
      console.warn('[engine] could not ask for an introduction', err);
    }
  }

  // Where modulation currently has each perform fader's parameter (0..1), so
  // /control can draw it beside the dialled value.
  macroLevels() {
    return resolveMacros(this.store.state).map((macro) => {
      if (!macro) return null;
      const live = this.pipeline.cur.instances.get(macro.fx)?.values[macro.key];
      return live === undefined ? null : Math.round(macroUnit(macro, live) * 1000) / 1000;
    });
  }

  // Where modulation has each slider it moves (0..1 along the slider), keyed
  // `effect:slider`, so the edit screen can draw it on the slider's bar.
  modLevels() {
    const out = {};
    for (const m of this.store.state.mappings) {
      const id = `${m.fx}:${m.key}`;
      if (m.enabled === false || id in out) continue;
      const inst = this.pipeline.cur.instances.get(m.fx);
      const live = inst?.values[m.key];
      if (live === undefined) continue;
      const spec = m.key === 'mix' ? { min: 0, max: 1 } : inst.def.params[m.key];
      if (spec) out[id] = Math.round(paramUnit(spec, live) * 1000) / 1000;
    }
    return out;
  }

  // The phone labels its trigger buttons with whatever they are bound to.
  sendTriggerLabels() {
    const labels = [];
    const actions = [];
    // Which buttons are switches that are on now (freeze, blackout, bypass):
    // the phone lights them.
    const on = [];
    const { globals } = this.store.state;
    for (let i = 1; i <= TRIGGER_COUNT; i++) {
      const bound = this.store.state.actions.find((b) => b.source === `trig.${i}`);
      labels.push(bound ? describeAction(bound.action) : `Trigger ${i}`);
      actions.push(bound?.action ?? '');
      on.push(!!globals[TOGGLE_ACTIONS[bound?.action]]);
    }
    this.sendPhones({ t: 'labels', triggers: labels, actions, on });
  }

  // The phone wears the palette and dimmer of the control page.
  sendLook() {
    this.sendPhones({ t: 'look', ...readLook() });
  }

  start() {
    if (this.running) return;
    this.running = true;
    this.goodAt.a = performance.now();
    this.goodAt.b = this.goodAt.a;
    this.session = Math.random().toString(36).slice(2, 10);
    this.lastStatusAt = performance.now();
    this.lastFrameAt = 0;
    this.prevFrameAt = undefined;
    this.renderFrames = 0;
    this.link.resume();
    if (this.store.state.net.second) this.linkB.resume();
    if (!this.lost) this.resync();
    const tick = (now) => {
      this.raf = requestAnimationFrame(tick);
      this.frame(now);
    };
    this.raf = requestAnimationFrame(tick);
  }

  // Lets go of everything another window's engine would need: the room code
  // first, then the recording, MIDI, the microphone, vision and the camera.
  stop() {
    if (!this.running) return;
    this.running = false;
    cancelAnimationFrame(this.raf);
    for (const link of this.links) link.shutdown();
    this.recorder.stop();
    this.probe.cancel();
    this.midi.disable();
    if (this.audio.state !== 'off') this.audio.disable();
    this.vision.configure({});
    this.forBody = false;
    this.bodyWantedAt = -Infinity;
    this.camera.stop();
    this.inputs.feeds.phone.clear();
    this.inputs.feeds.phone2.clear();
  }

  frame(now) {
    if (this.lastFrameAt) this.worstFrameMs = Math.max(this.worstFrameMs, now - this.lastFrameAt);
    this.lastFrameAt = now;

    const dt = Math.min(0.1, (now - (this.prevFrameAt ?? now)) / 1000);
    this.prevFrameAt = now;
    this.sensors.frame(dt, now);
    this.sensorsB.frame(dt, now);
    // Either phone's four buttons are the four triggers.
    for (let i = 0; i < TRIGGER_COUNT; i++) this.mod.set(`trig.${i + 1}`, this.sensors.shown[i] || this.sensorsB.shown[i] ? 1 : 0);
    this.audio.frame(dt, now, this.store.state.audio);
    const wantMotion = this.wantMotion();
    this.motion.frame(dt, wantMotion);
    this.mod.frame(dt, this.tempo.frame(now));
    this.glitchJump.frame(dt, this.store.state.glitch);
    const watched = now - this.controlSeenAt < CONTROL_TIMEOUT_MS;
    if (watched && now - this.lastSourcesAt >= SOURCES_INTERVAL_MS) {
      this.lastSourcesAt = now;
      this.bus.send('sources', { values: this.mod.snapshot(), macros: this.macroLevels(), mods: this.modLevels() });
    }

    this.inputs.feeds.phone.gated = this.link.hold;
    this.inputs.feeds.phone2.gated = this.linkB.hold;
    if (!this.lost) this.updateTurn(now);
    this.vision.frame(now, this.inputs.feed?.video ?? null, this.inputs.quarter);
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
      this.updateCover(dt, now);
      const flash = this.probe.frame(now, 1000 / Math.max(this.renderFps, 30));
      const remoteWatched = now - this.remoteControlSeenAt < CONTROL_TIMEOUT_MS;
      const wantPreview = remoteWatched && g.preview && now - this.lastPreviewAt >= PREVIEW_INTERVAL_MS;
      if (wantPreview) this.lastPreviewAt = now;
      // The small views go to whichever control page is looking, this one
      // included.
      if (!watched) this.peek = { a: '', b: '' };
      const wantThumbs = watched && now - this.lastThumbsAt >= THUMBS_INTERVAL_MS;
      if (wantThumbs) this.lastThumbsAt = now;
      try {
        // Collect the previous preview before a new one can be started.
        const preview = this.pipeline.pollPreview();
        if (preview) this.bus.send('preview', preview);
        const thumbs = this.pipeline.pollThumbs();
        if (thumbs) this.bus.send('thumbs', thumbs);
        const movedA = this.pipeline.pollMotion('a');
        if (movedA) this.motion.read('A', movedA);
        const movedB = this.pipeline.pollMotion('b');
        if (movedB) this.motion.read('B', movedB);
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
          wantThumbs,
          peek: this.peek,
          motion: { a: wantMotion.A, b: wantMotion.B },
          standby: this.cover.a > 0 ? { to: state.input.dropA, level: this.cover.a * this.cover.a * (3 - 2 * this.cover.a) } : null,
          bLevel: 1 - this.cover.b * this.cover.b * (3 - 2 * this.cover.b),
        });
      } catch (err) {
        // Never let one bad frame stop the show.
        if (!this.renderErrorLogged) console.error('[engine] render failed', err);
        this.renderErrorLogged = true;
      }
      this.renderFrames++;
      this.followBody(now);
      this.returnFeed.frame(now);
    }

    if (now - this.lastStatusAt >= STATUS_INTERVAL_MS) this.sendStatus(now);
  }

  // Which motion maps the modulation sources need: one that a mapping or a
  // trigger of the live preset reads.
  wantMotion() {
    const out = this.motionWanted;
    out.A = false;
    out.B = false;
    const { mappings, actions } = this.store.state;
    for (const list of [mappings, actions]) {
      for (const m of list) {
        const s = m.source;
        if (typeof s !== 'string' || !s.startsWith('motion') || m.enabled === false) continue;
        if (s[6] === 'A') out.A = true;
        else if (s[6] === 'B') out.B = true;
      }
    }
    return out;
  }

  // The link a source's picture comes over, if it is one of the phones.
  linkFor(kind) {
    return kind === 'phone' ? this.link : kind === 'phone2' ? this.linkB : null;
  }

  // What input A is doing, or with `inputs` given, input B.
  inputStatus(now, inputs = this.inputs) {
    const feed = inputs.feed;
    if (inputs.kind === 'pattern') return { kind: 'pattern', state: 'live', width: this.canvas.width, height: this.canvas.height };
    let state = 'no-signal';
    if (feed.gated && inputs.hasFrame) state = 'paused';
    else if (feed.lastFrameAt && now - feed.lastFrameAt < STALL_MS) state = 'live';
    else if (this.linkFor(inputs.kind)?.phoneInfo?.controllerOnly && this.linkFor(inputs.kind).conn?.open) state = 'paused';
    else if (inputs.hasFrame && feed.lastFrameAt) state = 'stalled';
    const turned = inputs.quarter % 2 === 1;
    return { kind: inputs.kind, state, width: turned ? feed.video.videoHeight : feed.video.videoWidth, height: turned ? feed.video.videoWidth : feed.video.videoHeight };
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
    this.sensorsB.takeRate(dt);
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
      ms += 45 + cameraFrameMs + (this.linkFor(this.inputs.kind)?.stats.rttMs ?? 0) / 2;
    }
    const prev = this.latency?.ms;
    this.latency = { ms: prev ? prev * 0.6 + ms * 0.4 : ms, measured: delay.fromCapture };
  }

  collectStatus(now) {
    return {
      build: __BUILD__,
      host: this.host,
      latency: this.latency,
      phone: this.link.status(now),
      sensors: this.sensors.status(now),
      // The second iPhone, or null while it is not wanted (net.second).
      phoneB: this.store.state.net.second ? this.linkB.status(now) : null,
      sensorsB: this.sensorsB.status(now),
      midi: this.midi.status(),
      audio: this.audio.status(),
      vision: { ...this.vision.status(), forBody: this.forBody && !this.store.state.vision.segment },
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
      // standby: how far the stand-by picture has come in over input A.
      input: { ...this.inputStatus(now), fps: this.inputFps, standby: this.cover.a },
      // Input B, or null while it is off.
      inputB: this.inputs.b.kind ? { ...this.inputStatus(now, this.inputs.b), standby: this.cover.b } : null,
      // Which sources have a picture to show right now.
      sources: { pattern: true, phone: this.inputs.feeds.phone.ready, phone2: this.inputs.feeds.phone2.ready, camera: this.inputs.feeds.camera.ready, file: this.inputs.feeds.file.ready },
    };
  }
}
