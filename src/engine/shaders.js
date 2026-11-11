// Engine-level shaders (everything that is not a user-facing effect).

const HEAD = /* glsl */ `#version 300 es
precision highp float;
in vec2 vUv;
out vec4 outColor;
`;

// Draws the input video into the working buffer with cover / contain fit.
export const SOURCE_FRAG = HEAD + /* glsl */ `
uniform sampler2D uTex;
uniform vec2 uFit;
uniform float uMirror;
void main() {
  vec2 uv = (vUv - 0.5) * uFit + 0.5;
  if (uMirror > 0.5) uv.x = 1.0 - uv.x;
  vec2 inside = step(vec2(0.0), uv) * step(uv, vec2(1.0));
  outColor = vec4(texture(uTex, uv).rgb * inside.x * inside.y, 1.0);
}
`;

export const COPY_FRAG = HEAD + /* glsl */ `
uniform sampler2D uTex;
void main() { outColor = vec4(texture(uTex, vUv).rgb, 1.0); }
`;

// Last pass: preset crossfade, glitch burst, master level (blackout).
export const FINAL_FRAG = HEAD + /* glsl */ `
uniform sampler2D uA;       // current scene
uniform sampler2D uB;       // scene being faded out
uniform float uFade;        // 0 = all B, 1 = all A
uniform float uGlitch;      // 0..1 burst envelope
uniform float uMaster;      // 0 = black
uniform float uFlash;       // 1 = solid white (latency test)
uniform float uTime;
uniform vec2 uResolution;

float hash(vec2 p) {
  p = fract(p * vec2(123.34, 456.21));
  p += dot(p, p + 45.32);
  return fract(p.x * p.y);
}

vec3 scene(vec2 uv) {
  vec3 a = texture(uA, uv).rgb;
  if (uFade >= 1.0) return a;
  return mix(texture(uB, uv).rgb, a, uFade);
}

void main() {
  vec2 uv = vUv;
  vec3 col;
  if (uGlitch > 0.001) {
    float t = floor(uTime * 24.0);
    float band = floor(uv.y * mix(6.0, 40.0, hash(vec2(t, 1.0))));
    float n = hash(vec2(band, t));
    float shift = (n - 0.5) * step(0.55, n) * 0.5 * uGlitch;
    uv.x = fract(uv.x + shift);
    float split = 0.02 * uGlitch * (0.5 + hash(vec2(t, 7.0)));
    col = vec3(scene(uv + vec2(split, 0.0)).r, scene(uv).g, scene(uv - vec2(split, 0.0)).b);
    col = mix(col, 1.0 - col, step(0.92, hash(vec2(band, t + 3.0))) * uGlitch);
  } else {
    col = scene(uv);
  }
  outColor = vec4(mix(col * uMaster, vec3(1.0), uFlash), 1.0);
}
`;

// Animated test source: bars, sweep, bouncing shapes, grid and a frame-rate
// tell-tale so stutter and tearing are visible at a glance.
export const PATTERN_FRAG = HEAD + /* glsl */ `
uniform float uTime;
uniform vec2 uResolution;

vec3 hsv(float h, float s, float v) {
  vec3 p = abs(fract(vec3(h) + vec3(1.0, 2.0 / 3.0, 1.0 / 3.0)) * 6.0 - 3.0);
  return v * mix(vec3(1.0), clamp(p - 1.0, 0.0, 1.0), s);
}

void main() {
  vec2 uv = vUv;
  float aspect = uResolution.x / uResolution.y;
  vec2 p = (uv - 0.5) * vec2(aspect, 1.0);
  float t = uTime;

  // Slow moving colour field.
  vec3 col = hsv(fract(0.08 * t + 0.25 * sin(p.x * 1.7 + t * 0.4) + 0.25 * cos(p.y * 2.3 - t * 0.3)), 0.75, 0.35);

  // Grid.
  vec2 g = abs(fract(p * 6.0) - 0.5);
  col += 0.12 * smoothstep(0.48, 0.5, max(g.x, g.y));

  // Colour bars along the top.
  if (uv.y > 0.84) {
    float i = floor(uv.x * 8.0);
    col = vec3(mod(i, 2.0), mod(floor(i / 2.0), 2.0), mod(floor(i / 4.0), 2.0));
    if (i > 6.5) col = vec3(0.5);
  }
  // Grey ramp along the bottom.
  if (uv.y < 0.08) col = vec3(floor(uv.x * 16.0) / 15.0);

  // Bouncing disc and orbiting dots.
  vec2 c = vec2(sin(t * 0.9) * (aspect * 0.5 - 0.15), cos(t * 1.3) * 0.25);
  float disc = smoothstep(0.13, 0.125, length(p - c));
  col = mix(col, hsv(fract(t * 0.2), 0.9, 1.0), disc);
  for (int k = 0; k < 5; k++) {
    float a = t * (0.6 + 0.15 * float(k)) + float(k) * 1.2566;
    vec2 q = 0.33 * vec2(cos(a), sin(a));
    col = mix(col, vec3(1.0), smoothstep(0.03, 0.025, length(p - q)));
  }

  // Rotating sweep line: one turn per second.
  float ang = atan(p.y, p.x);
  float sweep = fract((ang / 6.28318530718) - t);
  float ring = smoothstep(0.02, 0.0, abs(length(p) - 0.42));
  col += vec3(0.9, 1.0, 0.9) * ring * smoothstep(0.85, 1.0, sweep);

  // Centre cross.
  col = mix(col, vec3(1.0), smoothstep(0.004, 0.002, min(abs(p.x), abs(p.y))) * step(length(p), 0.06));

  outColor = vec4(clamp(col, 0.0, 1.0), 1.0);
}
`;
