// The render pipeline:
//   input texture -> source stage (fit) -> effects chain -> final pass -> screen
//
// A Runner renders one chain. During a preset crossfade two runners are alive
// and the final pass blends their outputs.

import { EFFECT_BY_ID } from '../effects/index.js';
import { FOOTER, HEADER } from '../effects/common.glsl.js';
import { Program, Target, createTexture, drawFullscreen } from './gl.js';
import { COPY_FRAG, FINAL_FRAG, PATTERN_FRAG, SOURCE_FRAG } from './shaders.js';

// Monitor image sent to /control (read back asynchronously, ~10 per second).
const PREVIEW_W = 480;
const PREVIEW_H = 270;
const MASK_MODES = { all: 0, person: 1, background: 2 };

function effectSource(def) {
  const uniforms = Object.keys(def.params)
    .map((key) => `uniform float ${key};`)
    .join('\n');
  return `${HEADER}\n${uniforms}\n${def.frag}\n${FOOTER}`;
}

// Ring buffer of past frames in a 2D array texture (one layer per frame).
class History {
  constructor(gl, spec, w, h) {
    this.gl = gl;
    this.frames = spec.frames ?? 60;
    this.maxWidth = spec.maxWidth ?? 960;
    this.head = 0;
    this.fbo = gl.createFramebuffer();
    this.tex = null;
    this.resize(w, h);
  }

  resize(w, h) {
    const gl = this.gl;
    const scale = Math.min(1, this.maxWidth / w);
    const tw = Math.max(16, Math.round(w * scale));
    const th = Math.max(16, Math.round(h * scale));
    if (this.tex && tw === this.w && th === this.h) return;
    if (this.tex) gl.deleteTexture(this.tex);
    this.w = tw;
    this.h = th;
    this.head = 0;
    this.tex = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D_ARRAY, this.tex);
    gl.texStorage3D(gl.TEXTURE_2D_ARRAY, 1, gl.RGBA8, tw, th, this.frames);
    gl.texParameteri(gl.TEXTURE_2D_ARRAY, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D_ARRAY, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D_ARRAY, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D_ARRAY, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.bindTexture(gl.TEXTURE_2D_ARRAY, null);
    this.filled = false;
  }

  // Stores `tex` as the newest frame.
  push(tex, copyProgram) {
    const gl = this.gl;
    copyProgram.use().tex('uTex', 0, tex);
    gl.bindFramebuffer(gl.FRAMEBUFFER, this.fbo);
    gl.viewport(0, 0, this.w, this.h);
    // First frame: fill every layer so the past is never black.
    const count = this.filled ? 1 : this.frames;
    for (let i = 0; i < count; i++) {
      this.head = (this.head + 1) % this.frames;
      gl.framebufferTextureLayer(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, this.tex, 0, this.head);
      drawFullscreen(gl);
    }
    this.filled = true;
  }

  dispose() {
    this.gl.deleteFramebuffer(this.fbo);
    this.gl.deleteTexture(this.tex);
  }
}

class EffectInstance {
  constructor(pipe, def) {
    this.pipe = pipe;
    this.def = def;
    this.program = pipe.programFor(def);
    this.values = { mix: 1 };
    for (const [key, spec] of Object.entries(def.params)) this.values[key] = spec.default;
    this.own = null;
    this.cur = 0;
    if (def.uses?.prev) {
      const { gl, width, height } = pipe;
      this.own = [new Target(gl, width, height), new Target(gl, width, height)];
    }
    this.history = def.uses?.history ? new History(pipe.gl, def.uses.history, pipe.width, pipe.height) : null;
  }

  resize(w, h) {
    if (this.own) for (const t of this.own) t.resize(w, h);
    this.history?.resize(w, h);
  }

  // Renders into `scratch` (or this effect's own buffer) and returns the
  // texture holding the result.
  render(ctx, inTex, scratch, item) {
    const gl = this.pipe.gl;
    if (this.history) this.history.push(inTex, this.pipe.copyProgram);
    const p = this.program.use();
    if (this.history) {
      p.tex('uHistory', 2, this.history.tex, gl.TEXTURE_2D_ARRAY);
      p.f('uHistoryHead', this.history.head).f('uHistoryCount', this.history.frames);
    }
    let dst = scratch;
    if (this.own) {
      dst = this.own[1 - this.cur];
      p.tex('uPrev', 1, this.own[this.cur].tex);
      this.cur = 1 - this.cur;
    }
    dst.bind();
    p.tex('uTex', 0, inTex);
    p.tex('uMask', 3, ctx.maskTex);
    p.i('uMaskMode', MASK_MODES[item.target] ?? 0);
    p.v4('uMaskFit', ctx.maskFit[0], ctx.maskFit[1], ctx.maskFit[2], ctx.maskFit[3]);
    p.f('uMix', this.values.mix);
    p.v2('uResolution', dst.w, dst.h);
    p.f('uTime', ctx.time);
    p.v3('uPhone', ctx.phone[0], ctx.phone[1], ctx.phone[2]);
    for (const key in this.def.params) p.f(key, this.values[key]);
    drawFullscreen(gl);
    return dst.tex;
  }

  dispose() {
    if (this.own) for (const t of this.own) t.dispose();
    this.history?.dispose();
  }
}

class Runner {
  constructor(pipe) {
    this.pipe = pipe;
    this.items = [];
    this.instances = new Map();
    const { gl, width, height } = pipe;
    this.a = new Target(gl, width, height);
    this.b = new Target(gl, width, height);
    this.out = null;
  }

  // Keeps instances (and their feedback buffers) for effects that survive.
  setItems(items) {
    const keep = new Set();
    for (const item of items) {
      const def = EFFECT_BY_ID[item.type];
      if (!def) continue;
      keep.add(item.uid);
      const existing = this.instances.get(item.uid);
      if (existing && existing.def === def) continue;
      existing?.dispose();
      try {
        this.instances.set(item.uid, new EffectInstance(this.pipe, def));
      } catch (err) {
        console.error(err);
        this.instances.delete(item.uid);
      }
    }
    for (const [uid, inst] of this.instances) {
      if (!keep.has(uid)) {
        inst.dispose();
        this.instances.delete(uid);
      }
    }
    this.items = items;
  }

  resize(w, h) {
    this.a.resize(w, h);
    this.b.resize(w, h);
    for (const inst of this.instances.values()) inst.resize(w, h);
  }

  // `resolve(item, inst)` fills inst.values (base value + modulation). When it
  // is null the previous values are reused (a scene that is fading out).
  render(ctx, srcTex, resolve) {
    let tex = srcTex;
    for (const item of this.items) {
      const inst = this.instances.get(item.uid);
      if (!inst) continue;
      if (resolve) resolve(item, inst);
      if (item.bypass || inst.values.mix <= 0) continue;
      const scratch = tex === this.a.tex ? this.b : this.a;
      tex = inst.render(ctx, tex, scratch, item);
    }
    this.out = tex;
    return tex;
  }

  dispose() {
    for (const inst of this.instances.values()) inst.dispose();
    this.instances.clear();
    this.a.dispose();
    this.b.dispose();
  }
}

export class Pipeline {
  constructor(gl, inputs) {
    this.gl = gl;
    this.inputs = inputs;
    this.width = 16;
    this.height = 16;
    this.programs = new Map();

    gl.bindVertexArray(gl.createVertexArray());
    gl.disable(gl.DEPTH_TEST);
    gl.disable(gl.BLEND);

    this.sourceProgram = new Program(gl, SOURCE_FRAG, 'source');
    this.patternProgram = new Program(gl, PATTERN_FRAG, 'pattern');
    this.copyProgram = new Program(gl, COPY_FRAG, 'copy');
    this.finalProgram = new Program(gl, FINAL_FRAG, 'final');

    this.src = new Target(gl, this.width, this.height);
    this.srcDirty = true;
    this.patternTime = 0;

    // 1x1 white stand-in until a segmentation mask exists.
    this.noMask = createTexture(gl, 1, 1);
    gl.texSubImage2D(gl.TEXTURE_2D, 0, 0, 0, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, new Uint8Array([255, 255, 255, 255]));

    this.cur = new Runner(this);
    this.prev = null;
    this.fade = null;

    this.preview = new Target(gl, PREVIEW_W, PREVIEW_H);
    this.pbo = gl.createBuffer();
    gl.bindBuffer(gl.PIXEL_PACK_BUFFER, this.pbo);
    gl.bufferData(gl.PIXEL_PACK_BUFFER, PREVIEW_W * PREVIEW_H * 4, gl.STREAM_READ);
    gl.bindBuffer(gl.PIXEL_PACK_BUFFER, null);
    this.previewSync = null;

    // Compile every effect up front so adding one mid-show never hitches.
    for (const def of Object.values(EFFECT_BY_ID)) {
      try {
        this.programFor(def);
      } catch (err) {
        console.error(err);
      }
    }
  }

  // Mean brightness (0..1) of the newest input frame, or null when the input
  // is not video. Reads back a 16x9 copy, so only use it while measuring.
  inputBrightness() {
    const gl = this.gl;
    if (this.inputs.kind === 'pattern' || !this.inputs.hasFrame) return null;
    this.probe ??= new Target(gl, 16, 9);
    this.probePixels ??= new Uint8Array(16 * 9 * 4);
    this.probe.bind();
    this.copyProgram.use().tex('uTex', 0, this.inputs.tex);
    drawFullscreen(gl);
    gl.readPixels(0, 0, 16, 9, gl.RGBA, gl.UNSIGNED_BYTE, this.probePixels);
    let sum = 0;
    for (let i = 0; i < this.probePixels.length; i += 4) sum += this.probePixels[i] * 0.2126 + this.probePixels[i + 1] * 0.7152 + this.probePixels[i + 2] * 0.0722;
    return sum / (16 * 9 * 255);
  }

  programFor(def) {
    let program = this.programs.get(def.id);
    if (!program) {
      program = new Program(this.gl, effectSource(def), `effect:${def.id}`);
      this.programs.set(def.id, program);
    }
    return program;
  }

  resize(w, h) {
    if (w === this.width && h === this.height) return;
    this.width = w;
    this.height = h;
    this.src.resize(w, h);
    this.srcDirty = true;
    this.cur.resize(w, h);
    this.prev?.resize(w, h);
  }

  // fade > 0 starts a crossfade from the running chain to the new one.
  setChain(items, fadeSeconds, now) {
    if (fadeSeconds > 0) {
      this.prev?.dispose();
      this.prev = this.cur;
      this.cur = new Runner(this);
      this.cur.setItems(items);
      this.fade = { start: now, duration: fadeSeconds * 1000 };
    } else {
      this.cur.setItems(items);
    }
  }

  fitScale(fit) {
    const { width: iw, height: ih } = this.inputs;
    if (!iw || !ih) return [1, 1];
    const r = this.width / this.height / (iw / ih);
    if (fit === 'stretch') return [1, 1];
    if (fit === 'contain') return [Math.max(1, r), Math.max(1, 1 / r)];
    return [Math.min(1, r), Math.min(1, 1 / r)];
  }

  updateSource(ctx, input, frozen) {
    const gl = this.gl;
    const inputs = this.inputs;
    if (inputs.kind === 'pattern') {
      if (!frozen) this.patternTime = ctx.time;
      if (frozen && !this.srcDirty) return;
      this.src.bind();
      this.patternProgram.use().f('uTime', this.patternTime).v2('uResolution', this.width, this.height);
      drawFullscreen(gl);
      this.srcDirty = false;
      return;
    }
    const uploaded = frozen ? false : inputs.update();
    if (!(uploaded || this.srcDirty) || !inputs.hasFrame) return;
    const [sx, sy] = this.fitScale(input.fit);
    this.src.bind();
    this.sourceProgram.use().tex('uTex', 0, inputs.tex).v2('uFit', sx, sy).f('uMirror', input.mirror ? 1 : 0);
    drawFullscreen(gl);
    this.srcDirty = false;
  }

  // ctx: { time, now, phone, maskTex, maskFit, glitch, master, bypassAll,
  //        frozen, input, resolve, canvasWidth, canvasHeight, wantPreview }
  render(ctx) {
    const gl = this.gl;
    ctx.maskTex = ctx.maskTex ?? this.noMask;

    this.updateSource(ctx, ctx.input, ctx.frozen);

    let fadeT = 1;
    if (this.fade) {
      fadeT = (ctx.now - this.fade.start) / this.fade.duration;
      if (fadeT >= 1) {
        fadeT = 1;
        this.fade = null;
        this.prev?.dispose();
        this.prev = null;
      }
    }

    let outA = this.src.tex;
    let outB = this.src.tex;
    if (!ctx.bypassAll) {
      outA = this.cur.render(ctx, this.src.tex, ctx.resolve);
      if (this.prev) outB = this.prev.render(ctx, this.src.tex, null);
    }
    if (!this.prev) outB = outA;

    const p = this.finalProgram.use();
    p.tex('uA', 0, outA).tex('uB', 1, outB);
    p.f('uFade', fadeT * fadeT * (3 - 2 * fadeT));
    p.f('uGlitch', ctx.glitch).f('uMaster', ctx.master).f('uTime', ctx.time).f('uFlash', ctx.flash ?? 0);
    p.v2('uResolution', this.width, this.height);
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    gl.viewport(0, 0, ctx.canvasWidth, ctx.canvasHeight);
    drawFullscreen(gl);

    if (ctx.wantPreview && !this.previewSync) {
      this.preview.bind();
      drawFullscreen(gl);
      gl.bindBuffer(gl.PIXEL_PACK_BUFFER, this.pbo);
      gl.readPixels(0, 0, PREVIEW_W, PREVIEW_H, gl.RGBA, gl.UNSIGNED_BYTE, 0);
      gl.bindBuffer(gl.PIXEL_PACK_BUFFER, null);
      this.previewSync = gl.fenceSync(gl.SYNC_GPU_COMMANDS_COMPLETE, 0);
      gl.flush();
    }
  }

  // Non-blocking readback of the preview started in render(). Returns
  // { width, height, pixels } once the GPU has finished, otherwise null.
  pollPreview() {
    const gl = this.gl;
    if (!this.previewSync) return null;
    const status = gl.clientWaitSync(this.previewSync, 0, 0);
    if (status === gl.TIMEOUT_EXPIRED) return null;
    gl.deleteSync(this.previewSync);
    this.previewSync = null;
    if (status === gl.WAIT_FAILED) return null;
    const pixels = new Uint8Array(PREVIEW_W * PREVIEW_H * 4);
    gl.bindBuffer(gl.PIXEL_PACK_BUFFER, this.pbo);
    gl.getBufferSubData(gl.PIXEL_PACK_BUFFER, 0, pixels);
    gl.bindBuffer(gl.PIXEL_PACK_BUFFER, null);
    return { width: PREVIEW_W, height: PREVIEW_H, pixels };
  }
}
