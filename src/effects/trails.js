export default {
  id: 'trails',
  name: 'Trails',
  uses: { prev: true },
  params: {
    persistence: { min: 0, max: 0.995, default: 0.9, step: 0.001 },
    blend: { options: { Lighten: 0, Smear: 1, Add: 2, Darken: 3 }, default: 0 },
  },
  frag: /* glsl */ `
vec4 effect(vec2 uv) {
  vec3 cur = texture(uTex, uv).rgb;
  vec3 old = texture(uPrev, uv).rgb;
  vec3 col;
  // The small constant makes 8-bit trails actually reach black.
  if (blend < 0.5) col = max(cur, old * persistence - 0.003);
  else if (blend < 1.5) col = mix(cur, old, persistence);
  else if (blend < 2.5) col = cur + max(old * persistence - 0.003, 0.0) * 0.97;
  else col = min(cur, mix(vec3(1.0), old, persistence) + 0.003);
  return vec4(clamp(col, 0.0, 1.0), 1.0);
}
`,
};
