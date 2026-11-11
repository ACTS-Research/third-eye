export default {
  id: 'levels',
  name: 'Contrast / Brightness',
  params: {
    brightness: { min: -1, max: 1, default: 0, step: 0.005 },
    contrast: { min: 0, max: 3, default: 1.2, step: 0.01 },
    saturation: { min: 0, max: 3, default: 1, step: 0.01 },
    gamma: { min: 0.2, max: 3, default: 1, step: 0.01 },
    invert: { type: 'bool', default: 0 },
  },
  frag: /* glsl */ `
vec4 effect(vec2 uv) {
  vec3 c = texture(uTex, uv).rgb;
  c = (c - 0.5) * contrast + 0.5 + brightness;
  c = mix(vec3(luma(c)), c, saturation);
  c = pow(clamp(c, 0.0, 1.0), vec3(1.0 / gamma));
  if (invert > 0.5) c = 1.0 - c;
  return vec4(c, 1.0);
}
`,
};
