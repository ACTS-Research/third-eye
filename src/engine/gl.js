// Small WebGL2 helpers: programs with cached uniform lookups, render targets,
// and a buffer-less fullscreen triangle.

import { VERTEX } from '../effects/common.glsl.js';

function compile(gl, type, source, label) {
  const shader = gl.createShader(type);
  gl.shaderSource(shader, source);
  gl.compileShader(shader);
  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS) && !gl.isContextLost()) {
    const log = gl.getShaderInfoLog(shader);
    gl.deleteShader(shader);
    throw new Error(`Shader compile failed (${label}):\n${log}`);
  }
  return shader;
}

export class Program {
  constructor(gl, fragSource, label = 'shader') {
    this.gl = gl;
    this.label = label;
    this.locations = new Map();
    const vs = compile(gl, gl.VERTEX_SHADER, VERTEX, `${label} vertex`);
    const fs = compile(gl, gl.FRAGMENT_SHADER, fragSource, label);
    const program = gl.createProgram();
    gl.attachShader(program, vs);
    gl.attachShader(program, fs);
    gl.linkProgram(program);
    gl.deleteShader(vs);
    gl.deleteShader(fs);
    if (!gl.getProgramParameter(program, gl.LINK_STATUS) && !gl.isContextLost()) {
      const log = gl.getProgramInfoLog(program);
      gl.deleteProgram(program);
      throw new Error(`Program link failed (${label}):\n${log}`);
    }
    this.program = program;
  }

  use() {
    this.gl.useProgram(this.program);
    return this;
  }

  loc(name) {
    let l = this.locations.get(name);
    if (l === undefined) {
      l = this.gl.getUniformLocation(this.program, name);
      this.locations.set(name, l);
    }
    return l;
  }

  f(name, x) { this.gl.uniform1f(this.loc(name), x); return this; }
  i(name, x) { this.gl.uniform1i(this.loc(name), x); return this; }
  v2(name, x, y) { this.gl.uniform2f(this.loc(name), x, y); return this; }
  v3(name, x, y, z) { this.gl.uniform3f(this.loc(name), x, y, z); return this; }
  v4(name, x, y, z, w) { this.gl.uniform4f(this.loc(name), x, y, z, w); return this; }

  tex(name, unit, texture, target) {
    const gl = this.gl;
    gl.activeTexture(gl.TEXTURE0 + unit);
    gl.bindTexture(target ?? gl.TEXTURE_2D, texture);
    gl.uniform1i(this.loc(name), unit);
    return this;
  }

  dispose() {
    this.gl.deleteProgram(this.program);
  }
}

export function createTexture(gl, w, h, { filter = gl.LINEAR, wrap = gl.CLAMP_TO_EDGE } = {}) {
  const tex = gl.createTexture();
  gl.bindTexture(gl.TEXTURE_2D, tex);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, filter);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, filter);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, wrap);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, wrap);
  if (w && h) gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, w, h, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
  return tex;
}

// A texture you can render into.
export class Target {
  constructor(gl, w, h) {
    this.gl = gl;
    this.w = 0;
    this.h = 0;
    this.tex = createTexture(gl);
    this.fbo = gl.createFramebuffer();
    gl.bindFramebuffer(gl.FRAMEBUFFER, this.fbo);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, this.tex, 0);
    this.resize(w, h);
  }

  resize(w, h) {
    if (w === this.w && h === this.h) return;
    const gl = this.gl;
    this.w = w;
    this.h = h;
    gl.bindTexture(gl.TEXTURE_2D, this.tex);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, w, h, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
    this.clear();
  }

  bind() {
    const gl = this.gl;
    gl.bindFramebuffer(gl.FRAMEBUFFER, this.fbo);
    gl.viewport(0, 0, this.w, this.h);
  }

  clear() {
    const gl = this.gl;
    this.bind();
    gl.clearColor(0, 0, 0, 1);
    gl.clear(gl.COLOR_BUFFER_BIT);
  }

  dispose() {
    this.gl.deleteFramebuffer(this.fbo);
    this.gl.deleteTexture(this.tex);
  }
}

export function drawFullscreen(gl) {
  gl.drawArrays(gl.TRIANGLES, 0, 3);
}
