export default {
  id: 'displace',
  name: 'Pixel Displacement',
  params: {
    source: { options: { Noise: 0, 'Own brightness': 1, 'Own colour': 2 }, default: 0 },
    amount: { min: 0, max: 0.3, default: 0.04, step: 0.001 },
    scale: { min: 0.5, max: 40, default: 5, step: 0.1 },
    speed: { min: 0, max: 4, default: 0.5, step: 0.01 },
    angle: { min: -1, max: 1, default: 0, step: 0.005 },
  },
  frag: /* glsl */ `
vec4 effect(vec2 uv) {
  // d is the direction each pixel is pushed, roughly -1..1 per axis.
  vec2 d;
  if (source < 0.5) {
    vec2 q = uv * vec2(ASPECT, 1.0) * scale;
    d = vec2(noise2(q + uTime * speed), noise2(q + 37.0 - uTime * speed)) * 2.0 - 1.0;
  } else if (source < 1.5) {
    d = vec2(luma(texture(uTex, uv).rgb) * 2.0 - 1.0, 0.0);
  } else {
    d = texture(uTex, uv).rg * 2.0 - 1.0;
  }
  d = rot2(angle * PI) * d;
  d.x /= ASPECT;
  return texture(uTex, mirrorUv(uv + d * amount));
}
`,
};
