export default {
  id: 'delay',
  name: 'Time Delay / Slit-scan',
  // Ring buffer of past input frames, kept at reduced size to bound memory
  // (frames x width x height x 4 bytes).
  uses: { history: { frames: 64, maxWidth: 960 } },
  params: {
    mode: { options: { 'Whole frame': 0, 'Slit-scan down': 1, 'Slit-scan across': 2, 'Slit-scan radial': 3, 'By brightness': 4 }, default: 1 },
    delay: { min: 0, max: 1, default: 0, step: 0.005 },
    spread: { min: -1, max: 1, default: 0.6, step: 0.005 },
  },
  frag: /* glsl */ `
// t = 0 is the newest frame, t = 1 the oldest one in the buffer.
vec3 past(vec2 uv, float t) {
  float f = clamp(t, 0.0, 1.0) * (uHistoryCount - 1.0);
  float i = floor(f);
  float l0 = mod(uHistoryHead - i + uHistoryCount, uHistoryCount);
  float l1 = mod(uHistoryHead - i - 1.0 + 2.0 * uHistoryCount, uHistoryCount);
  return mix(texture(uHistory, vec3(uv, l0)).rgb, texture(uHistory, vec3(uv, l1)).rgb, f - i);
}

vec4 effect(vec2 uv) {
  // Each pixel looks a different distance into the past.
  float g = 0.0;
  if (mode < 0.5) g = 0.0;
  else if (mode < 1.5) g = 1.0 - uv.y;
  else if (mode < 2.5) g = uv.x;
  else if (mode < 3.5) g = length((uv - 0.5) * vec2(ASPECT, 1.0)) * 1.6;
  else g = luma(texture(uTex, uv).rgb);
  g = clamp(g, 0.0, 1.0);
  if (spread < 0.0) g = 1.0 - g;
  return vec4(past(uv, delay + g * abs(spread)), 1.0);
}
`,
};
