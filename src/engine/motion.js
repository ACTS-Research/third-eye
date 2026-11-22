// The motion map: where an input's picture is moving, worked out in the
// shader by comparing each frame with the one before (no model). One small
// picture per input, built once a frame and shared by every effect that
// reads it (uses: { motion: true }) and by the Motion modulation sources.
//
// What a texel of the map holds (see motionAt() in common.glsl.js):
//   r   movement now, 0..1 (camera noise is taken off first)
//   g   the same with a short wake: movement lingers about half a second
//   b,a the rough direction and speed of the movement, around 0.5
//
// Nothing here runs unless the pipeline asks: a preset with no motion
// effect and no motion source costs nothing.

import { Target, drawFullscreen } from './gl.js';

export const MOTION_W = 320;
// The picture the engine reads back for the modulation sources.
export const STATS_W = 16;
export const STATS_H = 9;
// A map nobody has refreshed for this long starts again from "no movement".
const STALE_MS = 500;
// With no new input frame for this long (a frozen or stalled source), the
// map is refreshed anyway so that movement dies away instead of sticking.
const IDLE_MS = 100;
// Direction is stored as a share of this much of the picture per frame.
export const FLOW_RANGE = 0.05;

const HEAD = /* glsl */ `#version 300 es
precision highp float;
in vec2 vUv;
out vec4 outColor;
`;

// The input, small and grey. Four taps cover the pixels each texel stands for.
export const GREY_FRAG = HEAD + /* glsl */ `
uniform sampler2D uTex;
uniform vec2 uTexel;   // one texel of the small picture, in uv
void main() {
  vec3 c = texture(uTex, vUv + uTexel * vec2(-0.25, -0.25)).rgb + texture(uTex, vUv + uTexel * vec2(0.25, -0.25)).rgb
         + texture(uTex, vUv + uTexel * vec2(-0.25, 0.25)).rgb + texture(uTex, vUv + uTexel * vec2(0.25, 0.25)).rgb;
  outColor = vec4(vec3(dot(c * 0.25, vec3(0.2126, 0.7152, 0.0722))), 1.0);
}
`;

export const MOTION_FRAG = HEAD + /* glsl */ `
uniform sampler2D uNow;    // grey, with mip levels
uniform sampler2D uWas;    // grey of the frame before, with mip levels
uniform sampler2D uMap;    // the map as it was
uniform vec2 uTexel;       // one texel of the map, in uv
uniform float uPrimed;     // 0 on the first frame: no movement yet

float now(vec2 uv, float lod) { return textureLod(uNow, uv, lod).r; }
float was(vec2 uv, float lod) { return textureLod(uWas, uv, lod).r; }

void main() {
  vec4 old = texture(uMap, vUv);
  // How much: the change in brightness, a little blurred, with the grain of
  // a camera taken off.
  float change = abs(now(vUv, 1.0) - was(vUv, 1.0));
  float amount = clamp((change - 0.012) * 6.0, 0.0, 1.0) * uPrimed;
  float wake = max(amount, old.g * 0.9 - 0.004);

  // Which way: brightness that rises where the picture is brighter to one
  // side has come from that side. Read coarsely (a quarter of the map's
  // size) so that fast movement still registers.
  vec2 e = uTexel * 4.0;
  float dt = now(vUv, 2.0) - was(vUv, 2.0);
  vec2 grad = vec2(
    now(vUv + vec2(e.x, 0.0), 2.0) + was(vUv + vec2(e.x, 0.0), 2.0) - now(vUv - vec2(e.x, 0.0), 2.0) - was(vUv - vec2(e.x, 0.0), 2.0),
    now(vUv + vec2(0.0, e.y), 2.0) + was(vUv + vec2(0.0, e.y), 2.0) - now(vUv - vec2(0.0, e.y), 2.0) - was(vUv - vec2(0.0, e.y), 2.0)) * 0.25;
  // In coarse texels per frame, then as a share of the picture.
  vec2 flow = clamp(-dt * grad / (dot(grad, grad) + 0.0004), -4.0, 4.0) * e / ${FLOW_RANGE.toFixed(3)};
  vec2 before = (old.ba - 128.0 / 255.0) * 2.0;
  vec2 dir;
  if (abs(dt) > 0.01 && uPrimed > 0.5) {
    dir = mix(before, clamp(flow, -1.0, 1.0), 0.35);
  } else {
    dir = before * 0.85;
    dir -= sign(dir) * min(abs(dir), vec2(0.012));
  }
  outColor = vec4(amount, wake, dir * 0.5 + 128.0 / 255.0);
}
`;

// The map averaged down to a few cells, for the modulation sources.
export const STATS_FRAG = HEAD + /* glsl */ `
uniform sampler2D uMap;
uniform vec2 uCell;   // one cell of this picture, in uv
void main() {
  float sum = 0.0;
  for (int y = 0; y < 5; y++) {
    for (int x = 0; x < 5; x++) {
      sum += texture(uMap, vUv + (vec2(float(x), float(y)) - 2.0) * 0.2 * uCell).r;
    }
  }
  outColor = vec4(vec3(sum / 25.0), 1.0);
}
`;

function mipTarget(gl, w, h) {
  const t = new Target(gl, w, h);
  gl.bindTexture(gl.TEXTURE_2D, t.tex);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR_MIPMAP_LINEAR);
  gl.generateMipmap(gl.TEXTURE_2D);
  return t;
}

export class MotionMap {
  // `programs`: { grey, motion, stats } compiled once by the pipeline.
  constructor(gl, programs, Readback) {
    this.gl = gl;
    this.programs = programs;
    this.w = MOTION_W;
    this.h = 180;
    this.grey = [mipTarget(gl, this.w, this.h), mipTarget(gl, this.w, this.h)];
    this.map = [new Target(gl, this.w, this.h), new Target(gl, this.w, this.h)];
    this.cur = 0;
    this.updatedAt = -Infinity;
    this.fresh = false;
    this.stats = new Readback(gl, STATS_W, STATS_H);
    this.reset();
  }

  get tex() {
    return this.map[this.cur].tex;
  }

  // No movement, no direction.
  reset() {
    const gl = this.gl;
    for (const t of this.map) {
      t.bind();
      gl.clearColor(0, 0, 128 / 255, 128 / 255);
      gl.clear(gl.COLOR_BUFFER_BIT);
    }
    this.primed = false;
  }

  // Follows the shape of the picture.
  resize(width, height) {
    const h = Math.max(8, Math.round((MOTION_W * height) / width));
    if (h === this.h) return;
    this.h = h;
    for (const t of [...this.grey, ...this.map]) t.resize(this.w, h);
    this.reset();
  }

  // Called every frame the map is wanted. `changed`: the input has a new
  // frame in `tex`.
  update(tex, changed, now) {
    if (now - this.updatedAt > STALE_MS) this.reset();
    else if (!changed && now - this.updatedAt < IDLE_MS) return;
    const gl = this.gl;
    const next = 1 - this.cur;
    const grey = this.grey[next];
    grey.bind();
    this.programs.grey.use().tex('uTex', 0, tex).v2('uTexel', 1 / this.w, 1 / this.h);
    drawFullscreen(gl);
    gl.bindTexture(gl.TEXTURE_2D, grey.tex);
    gl.generateMipmap(gl.TEXTURE_2D);
    this.map[next].bind();
    this.programs.motion
      .use()
      .tex('uNow', 0, grey.tex)
      .tex('uWas', 1, this.grey[this.cur].tex)
      .tex('uMap', 2, this.map[this.cur].tex)
      .v2('uTexel', 1 / this.w, 1 / this.h)
      .f('uPrimed', this.primed ? 1 : 0);
    drawFullscreen(gl);
    this.cur = next;
    this.primed = true;
    this.updatedAt = now;
    this.fresh = true;
  }

  // Starts a readback of the averaged map, when there is something new.
  readStats() {
    if (!this.fresh || this.stats.busy) return;
    this.fresh = false;
    this.stats.target.bind();
    this.programs.stats.use().tex('uMap', 0, this.tex).v2('uCell', 1 / STATS_W, 1 / STATS_H);
    drawFullscreen(this.gl);
    this.stats.start();
  }

  dispose() {
    for (const t of [...this.grey, ...this.map]) t.dispose();
  }
}

// Turns the averaged maps into modulation sources: how much is moving in the
// whole picture and in each half, and where the movement is.
const KEYS = ['all', 'left', 'right', 'top', 'bottom'];

export class MotionSources {
  constructor(mod) {
    this.mod = mod;
    this.sides = { A: this.blank(), B: this.blank() };
  }

  blank() {
    return { target: { all: 0, left: 0, right: 0, top: 0, bottom: 0, x: 0.5, y: 0.5 }, value: null, live: false, age: 0 };
  }

  // `stats`: { width, height, pixels } from MotionMap, rows bottom to top.
  read(tag, stats) {
    const { width: w, height: h, pixels } = stats;
    const sum = { all: 0, left: 0, right: 0, top: 0, bottom: 0 };
    let sx = 0;
    let sy = 0;
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const v = pixels[(y * w + x) * 4] / 255;
        sum.all += v;
        if (x < w / 2) sum.left += v;
        else sum.right += v;
        if (y < h / 2) sum.bottom += v;
        else sum.top += v;
        sx += v * (x + 0.5);
        sy += v * (y + 0.5);
      }
    }
    this.sides[tag].age = 0;
    const t = this.sides[tag].target;
    const cells = w * h;
    // A moving arm is a few per cent of the picture: the square root gives
    // small movement a useful reading and leaves room for a whole body.
    t.all = Math.min(1, Math.sqrt((sum.all / cells) * 4));
    for (const key of KEYS.slice(1)) t[key] = Math.min(1, Math.sqrt((sum[key] / (cells / 2)) * 4));
    // Where the movement is; it stays where it last was when all is still.
    if (sum.all / cells > 0.004) {
      t.x = sx / sum.all / w;
      t.y = sy / sum.all / h;
    }
  }

  // `wanted`: { A, B }. A side nobody wants any more reads zero.
  frame(dt, wanted) {
    for (const tag of ['A', 'B']) {
      const side = this.sides[tag];
      if (!wanted[tag]) {
        if (side.live) {
          for (const key of KEYS) this.mod.set(`motion${tag}.${key}`, 0);
          side.live = false;
          side.value = null;
          Object.assign(side.target, { all: 0, left: 0, right: 0, top: 0, bottom: 0 });
        }
        continue;
      }
      side.live = true;
      side.value ??= { ...side.target };
      // No reading for a while (input B switched off, say): nothing moves.
      side.age += dt;
      if (side.age > 0.4) Object.assign(side.target, { all: 0, left: 0, right: 0, top: 0, bottom: 0 });
      for (const key in side.target) {
        const to = side.target[key];
        const from = side.value[key];
        // Quick to rise, a little slower to fall, so a reading is not a flicker.
        const tau = key === 'x' || key === 'y' ? 0.12 : to > from ? 0.04 : 0.2;
        side.value[key] = from + (to - from) * (1 - Math.exp(-dt / tau));
        this.mod.set(`motion${tag}.${key}`, side.value[key]);
      }
    }
  }
}
