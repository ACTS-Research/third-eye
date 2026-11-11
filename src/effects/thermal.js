export default {
  id: 'thermal',
  name: 'False Colour / Thermal',
  params: {
    palette: { options: { Thermal: 0, 'Night vision': 1, Rainbow: 2, Fire: 3, Ice: 4 }, default: 0 },
    contrast: { min: 0.2, max: 4, default: 1.2, step: 0.01 },
    shift: { min: -1, max: 1, default: 0, step: 0.005 },
    cycle: { min: -2, max: 2, default: 0, step: 0.01 },
    bands: { min: 0, max: 24, default: 0, step: 1 },
  },
  frag: /* glsl */ `
vec3 ramp5(float t, vec3 a, vec3 b, vec3 c, vec3 d, vec3 e) {
  t = clamp(t, 0.0, 1.0) * 4.0;
  if (t < 1.0) return mix(a, b, t);
  if (t < 2.0) return mix(b, c, t - 1.0);
  if (t < 3.0) return mix(c, d, t - 2.0);
  return mix(d, e, t - 3.0);
}

vec3 colourMap(float t) {
  if (palette < 0.5) return ramp5(t, vec3(0.0, 0.0, 0.1), vec3(0.3, 0.0, 0.6), vec3(0.9, 0.1, 0.2), vec3(1.0, 0.7, 0.0), vec3(1.0, 1.0, 0.9));
  if (palette < 1.5) return ramp5(t, vec3(0.0), vec3(0.0, 0.2, 0.05), vec3(0.1, 0.6, 0.1), vec3(0.4, 1.0, 0.3), vec3(0.9, 1.0, 0.8));
  if (palette < 2.5) return hsv2rgb(vec3(fract(0.75 - t * 0.75), 0.9, 1.0));
  if (palette < 3.5) return ramp5(t, vec3(0.0), vec3(0.5, 0.0, 0.0), vec3(1.0, 0.3, 0.0), vec3(1.0, 0.8, 0.1), vec3(1.0));
  return ramp5(t, vec3(0.0, 0.0, 0.05), vec3(0.0, 0.15, 0.5), vec3(0.0, 0.6, 0.9), vec3(0.6, 0.9, 1.0), vec3(1.0));
}

vec4 effect(vec2 uv) {
  float t = (luma(texture(uTex, uv).rgb) - 0.5) * contrast + 0.5 + shift;
  if (bands > 1.5) t = floor(t * bands) / (bands - 1.0);
  if (cycle != 0.0) t = abs(fract((t + uTime * cycle) * 0.5) * 2.0 - 1.0);
  return vec4(colourMap(t), 1.0);
}
`,
};
