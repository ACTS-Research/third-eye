// Owns the WebGL context, the render loop and everything that feeds it.
// Runs only in /output.

import { clamp } from '../shared/util.js';
import { InputManager } from './inputs.js';
import { Pipeline } from './pipeline.js';

const MAX_EDGE = 4096;
const GLITCH_MS = 450;
const STALL_MS = 1000;
const PREVIEW_INTERVAL_MS = 100;
const STATUS_INTERVAL_MS = 500;

export class Engine {
  constructor(canvas, store, bus) {
    this.canvas = canvas;
    this.store = store;
    this.bus = bus;
    this.inputs = new InputManager();
    this.t0 = performance.now();
    this.glitchStart = -1e9;
    this.phone = [0, 0, 0];
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

    this.resolve = (item, inst) => {
      const v = inst.values;
      const params = item.params;
      for (const key in inst.def.params) v[key] = params[key];
      v.mix = item.mix;
    };

    this.initGL();

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
    store.onEvent((name) => {
      if (name === 'glitch') this.glitchStart = performance.now();
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
      case 'replace':
        this.pipeline.setChain(state.chain, 0, performance.now());
        this.inputs.setKind(state.input.kind);
        this.pipeline.srcDirty = true;
        this.applySize();
        break;
      case 'merge':
        if (op.key === 'input') {
          this.inputs.setKind(state.input.kind);
          this.pipeline.srcDirty = true;
        } else if (op.key === 'globals' && 'renderScale' in op.patch) {
          this.applySize();
        }
        break;
      default:
        break;
    }
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

    if (!this.lost) {
      const state = this.store.state;
      const g = state.globals;
      const wantPreview = g.preview && now - this.lastPreviewAt >= PREVIEW_INTERVAL_MS;
      if (wantPreview) this.lastPreviewAt = now;
      try {
        this.pipeline.render({
          now,
          time: (now - this.t0) / 1000,
          phone: this.phone,
          maskTex: null,
          maskFit: this.maskFit,
          glitch: clamp(1 - (now - this.glitchStart) / GLITCH_MS, 0, 1),
          master: g.blackout ? 0 : 1,
          bypassAll: g.bypassAll,
          frozen: g.freeze,
          input: state.input,
          resolve: this.resolve,
          canvasWidth: this.canvas.width,
          canvasHeight: this.canvas.height,
          wantPreview,
        });
        const preview = this.pipeline.pollPreview();
        if (preview) this.bus.send('preview', preview);
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
    if (feed.lastFrameAt && now - feed.lastFrameAt < STALL_MS) state = 'live';
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
    this.bus.send('status', { status: this.collectStatus(now) });
    this.worstFrameMs = 0;
  }

  collectStatus(now) {
    return {
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
