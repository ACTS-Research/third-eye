export default {
  id: 'rgbshift',
  name: 'RGB Offset',
  params: {
    amount: { min: 0, max: 0.1, default: 0.01, step: 0.0005 },
    angle: { min: -1, max: 1, default: 0, step: 0.001 },
    radial: { min: 0, max: 1, default: 0, step: 0.01 },
  },
  frag: /* glsl */ `
vec4 effect(vec2 uv) {
  // Red and blue are pulled apart along a direction; "radial" bends that
  // direction outward from the centre like lens chromatic aberration.
  float a = angle * PI;
  vec2 linear = vec2(cos(a), sin(a));
  vec2 outward = (uv - 0.5) * 2.0;
  vec2 d = mix(linear, outward, radial) * amount;
  d.x /= ASPECT;
  float r = texture(uTex, mirrorUv(uv + d)).r;
  float g = texture(uTex, uv).g;
  float b = texture(uTex, mirrorUv(uv - d)).b;
  return vec4(r, g, b, 1.0);
}
`,
};
