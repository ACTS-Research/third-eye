export default {
  id: 'posterize',
  name: 'Posterize',
  params: {
    levels: { min: 2, max: 32, default: 5, step: 1 },
    gamma: { min: 0.3, max: 3, default: 1, step: 0.01 },
    dither: { min: 0, max: 1, default: 0, step: 0.01 },
    pixelate: { min: 1, max: 120, default: 1, step: 1 },
  },
  frag: /* glsl */ `
vec4 effect(vec2 uv) {
  vec2 cell = uResolution / max(1.0, pixelate);
  vec2 puv = pixelate > 1.5 ? (floor(uv * cell) + 0.5) / cell : uv;
  vec3 c = pow(texture(uTex, puv).rgb, vec3(gamma));
  float n = max(2.0, floor(levels + 0.5)) - 1.0;
  float d = (hash21(floor(puv * uResolution)) - 0.5) * dither;
  c = floor(c * n + 0.5 + d) / n;
  return vec4(pow(clamp(c, 0.0, 1.0), vec3(1.0 / gamma)), 1.0);
}
`,
};
