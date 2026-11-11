export default {
  id: 'orient',
  name: 'Rotate / Counter-rotate',
  params: {
    // 1 cancels the phone's roll (horizon lock), -1 doubles it, 0 ignores it.
    follow: { min: -2, max: 2, default: 1, step: 0.01 },
    angle: { min: -1, max: 1, default: 0, step: 0.002 },
    zoom: { min: 0.5, max: 4, default: 1.3, step: 0.01 },
    edge: { options: { Mirror: 0, Black: 1, Stretch: 2 }, default: 0 },
  },
  frag: /* glsl */ `
vec4 effect(vec2 uv) {
  // uPhone.x is the phone's roll about the camera axis, in radians.
  vec2 p = uv - 0.5;
  p.x *= ASPECT;
  p = rot2(uPhone.x * follow + angle * PI) * p / zoom;
  p.x /= ASPECT;
  vec2 q = p + 0.5;
  if (edge < 0.5) return texture(uTex, mirrorUv(q));
  if (edge < 1.5) return vec4(texture(uTex, q).rgb * inFrame(q), 1.0);
  return texture(uTex, clamp(q, 0.0, 1.0));
}
`,
};
