// GLSL shared by every effect. The engine prepends this (plus one
// `uniform float <name>;` per declared parameter) to each effect body.
//
// Built-in uniforms available to an effect:
//   uTex          sampler2D       the image coming into this effect
//   uPrev         sampler2D       this effect's own previous output  (uses.prev)
//   uHistory      sampler2DArray  ring buffer of past input frames   (uses.history)
//   uHistoryHead  float           layer index of the newest frame
//   uHistoryCount float           number of layers in the ring buffer
//   uResolution   vec2            render size in pixels
//   uTime         float           seconds since the output window loaded
//   uPhone        vec3            phone roll, pitch, yaw in radians
//
// An effect body defines:  vec4 effect(vec2 uv)
// uv is 0..1 with (0,0) at the bottom-left. Wet/dry mix and person/background
// masking are applied by the engine after effect() returns.

export const HEADER = /* glsl */ `#version 300 es
precision highp float;
precision highp sampler2DArray;

in vec2 vUv;
out vec4 outColor;

uniform sampler2D uTex;
uniform sampler2D uPrev;
uniform sampler2DArray uHistory;
uniform float uHistoryHead;
uniform float uHistoryCount;
uniform sampler2D uMask;
uniform int uMaskMode;      // 0 everything, 1 person only, 2 background only
uniform vec4 uMaskFit;      // xy scale, z mirror, w mask available
uniform float uMix;
uniform vec2 uResolution;
uniform float uTime;
uniform vec3 uPhone;

#define PI 3.14159265359
#define TAU 6.28318530718
#define ASPECT (uResolution.x / uResolution.y)

float luma(vec3 c) { return dot(c, vec3(0.2126, 0.7152, 0.0722)); }

mat2 rot2(float a) { float c = cos(a), s = sin(a); return mat2(c, -s, s, c); }

// Reflects uv back into 0..1 so off-screen samples mirror instead of smearing.
vec2 mirrorUv(vec2 uv) { return 1.0 - abs(1.0 - mod(uv, 2.0)); }

// 1 inside 0..1, 0 outside.
float inFrame(vec2 uv) {
  vec2 s = step(vec2(0.0), uv) * step(uv, vec2(1.0));
  return s.x * s.y;
}

vec3 rgb2hsv(vec3 c) {
  vec4 K = vec4(0.0, -1.0 / 3.0, 2.0 / 3.0, -1.0);
  vec4 p = mix(vec4(c.bg, K.wz), vec4(c.gb, K.xy), step(c.b, c.g));
  vec4 q = mix(vec4(p.xyw, c.r), vec4(c.r, p.yzx), step(p.x, c.r));
  float d = q.x - min(q.w, q.y);
  float e = 1.0e-10;
  return vec3(abs(q.z + (q.w - q.y) / (6.0 * d + e)), d / (q.x + e), q.x);
}

vec3 hsv2rgb(vec3 c) {
  vec3 p = abs(fract(c.xxx + vec3(1.0, 2.0 / 3.0, 1.0 / 3.0)) * 6.0 - 3.0);
  return c.z * mix(vec3(1.0), clamp(p - 1.0, 0.0, 1.0), c.y);
}

// Rotates hue by turns (1.0 = full circle) without leaving RGB.
vec3 hueRotate(vec3 c, float turns) {
  float a = turns * TAU;
  vec3 k = vec3(0.57735);
  float ca = cos(a);
  return c * ca + cross(k, c) * sin(a) + k * dot(k, c) * (1.0 - ca);
}

float hash21(vec2 p) {
  p = fract(p * vec2(123.34, 456.21));
  p += dot(p, p + 45.32);
  return fract(p.x * p.y);
}

float noise2(vec2 p) {
  vec2 i = floor(p), f = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash21(i), hash21(i + vec2(1, 0)), f.x),
             mix(hash21(i + vec2(0, 1)), hash21(i + vec2(1, 1)), f.x), f.y);
}
`;

export const FOOTER = /* glsl */ `
void main() {
  vec4 dry = texture(uTex, vUv);
  vec4 wet = effect(vUv);
  float amount = uMix;
  if (uMaskMode != 0 && uMaskFit.w > 0.5) {
    vec2 muv = (vUv - 0.5) * uMaskFit.xy + 0.5;
    if (uMaskFit.z > 0.5) muv.x = 1.0 - muv.x;
    float person = smoothstep(0.35, 0.65, texture(uMask, muv).r) * inFrame(muv);
    amount *= (uMaskMode == 1) ? person : 1.0 - person;
  }
  outColor = vec4(mix(dry.rgb, wet.rgb, amount), 1.0);
}
`;

export const VERTEX = /* glsl */ `#version 300 es
out vec2 vUv;
void main() {
  // One oversized triangle covering the viewport; no vertex buffers needed.
  vec2 p = vec2(float((gl_VertexID << 1) & 2), float(gl_VertexID & 2));
  vUv = p;
  gl_Position = vec4(p * 2.0 - 1.0, 0.0, 1.0);
}
`;
