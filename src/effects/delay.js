// Time: each point of the picture looks some way into the past. The id is
// still 'delay' (it was Time Delay / Slit-scan until 24 November 2026), so
// saved presets keep it; a preset saved before then gets reach 1 s and
// "driven by: Itself", which is how it looked.
import { driveParam } from './drive.js';

export default {
  id: 'delay',
  name: 'Time',
  // 256 past frames, small, stored as often as `reach` needs (one a frame
  // at most): 512 × 288 × 4 bytes × 256 ≈ 150 MB while Time is in a chain.
  uses: { history: { frames: 256, maxWidth: 512 }, drive: true },
  params: {
    // How far back the oldest picture is, in seconds.
    reach: { min: 1, max: 8, default: 1, step: 0.1, curve: 2 },
    // How far back every point looks at least, as a share of reach.
    delay: { min: 0, max: 1, default: 0, step: 0.005 },
    // How much further back the driver sends a point (negative: the other way round).
    spread: { min: -1, max: 1, default: 0.6, step: 0.005 },
    drive: driveParam(),
    // The shape used when driven by Itself.
    mode: { label: 'shape', options: { 'Whole frame': 0, Down: 1, Across: 2, 'From the centre': 3, Brightness: 4 }, default: 1 },
  },
  frag: /* glsl */ `
// t = 0 is the newest frame, t = 1 the oldest within reach.
vec3 past(vec2 uv, float t) {
  float f = clamp(t, 0.0, 1.0) * (uHistorySpan - 1.0);
  float i = floor(f);
  float l0 = mod(uHistoryHead - i + uHistoryCount, uHistoryCount);
  float l1 = mod(uHistoryHead - i - 1.0 + 2.0 * uHistoryCount, uHistoryCount);
  return mix(texture(uHistory, vec3(uv, l0)).rgb, texture(uHistory, vec3(uv, l1)).rgb, f - i);
}

vec4 effect(vec2 uv) {
  // Each pixel looks a different distance into the past.
  float g = driveAt(uv, drive);
  if (g < 0.0) {
    if (mode < 0.5) g = 0.0;
    else if (mode < 1.5) g = 1.0 - uv.y;
    else if (mode < 2.5) g = uv.x;
    else if (mode < 3.5) g = length((uv - 0.5) * vec2(ASPECT, 1.0)) * 1.6;
    else g = luma(texture(uTex, uv).rgb);
  }
  g = clamp(g, 0.0, 1.0);
  if (spread < 0.0) g = 1.0 - g;
  return vec4(past(uv, delay + g * abs(spread)), 1.0);
}
`,
};
