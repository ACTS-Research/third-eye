export default {
  id: 'hue',
  name: 'Hue Shift',
  params: {
    shift: { min: -1, max: 1, default: 0.25, step: 0.005 },
    cycle: { min: -2, max: 2, default: 0, step: 0.01 },
    saturation: { min: 0, max: 3, default: 1, step: 0.01 },
  },
  frag: /* glsl */ `
vec4 effect(vec2 uv) {
  vec3 hsv = rgb2hsv(texture(uTex, uv).rgb);
  hsv.x = fract(hsv.x + shift + uTime * cycle);
  hsv.y = clamp(hsv.y * saturation, 0.0, 1.0);
  return vec4(hsv2rgb(hsv), 1.0);
}
`,
};
