// Scan: the picture drawn as scan lines, each lifted into relief by what
// drives it (its own brightness to start with), like a landscape seen from
// the front: a nearer line that rises hides the lines behind it.
import { driveParam } from './drive.js';

export default {
  id: 'scan',
  name: 'Scan',
  uses: { mips: true, drive: true },
  params: {
    lines: { min: 10, max: 300, default: 80, step: 1, curve: 2 },
    // How high the brightest point lifts its line, as a share of the
    // picture; to the left it pushes the lines down instead.
    lift: { min: -1, max: 1, default: 0.4, step: 0.005, center: 0, curve: 1.5 },
    // Of the gap between two lines; never under a pixel.
    thickness: { min: 0, max: 1, default: 0.25, step: 0.005 },
    drive: driveParam(),
    // What fills the space between the lines.
    between: { options: { Black: 0, Dimmed: 1, Picture: 2 }, default: 0 },
    colour: { options: { 'The picture': 0, White: 1 }, default: 0 },
    direction: { options: { Across: 0, Down: 1 }, default: 0 },
  },
  frag: /* glsl */ `
// At most this many lines are looked at for each point.
#define MAX_REACH 96

// A point in line space: x along a line, y across the lines (up), both 0..1.
vec2 toUv(vec2 p, bool down, bool flip) {
  if (flip) p.y = 1.0 - p.y;
  return down ? vec2(p.y, 1.0 - p.x) : p;
}

float driverAt(vec2 uv) {
  float d = driveAt(uv, drive);
  return d < 0.0 ? luma(textureLod(uTexMip, uv, 1.0).rgb) : d;
}

vec4 effect(vec2 uv) {
  bool down = direction > 0.5;
  bool flip = lift < 0.0;
  // Into line space (lines run across, lift raises them).
  vec2 p = down ? vec2(1.0 - uv.y, uv.x) : uv;
  if (flip) p.y = 1.0 - p.y;
  float size = down ? uResolution.x : uResolution.y;
  float gap = 1.0 / lines;
  float h = abs(lift) * 0.3;
  float half_ = max(0.6 / size, thickness * gap * 0.5);
  float aa = 0.75 / size;

  vec3 live = texture(uTex, uv).rgb;
  vec3 fill = between < 0.5 ? vec3(0.0) : between < 1.5 ? live * 0.25 : live;

  // Lines whose base is at most this far below the point can reach it.
  int below = int(ceil((h + half_) / gap)) + 1;
  int top = int(floor(p.y / gap - 0.5)) + 1;
  // Nearest (lowest) line first: the first that covers the point wins, and
  // a nearer line risen above the point hides every line behind it.
  for (int k = 0; k < MAX_REACH; k++) {
    int i = top - min(below, MAX_REACH - 1) + k;
    if (i > top) break;
    if (i < 0) continue;
    float base = (float(i) + 0.5) * gap;
    vec2 src = toUv(vec2(p.x, base), down, flip);
    float y = base + h * driverAt(src);
    float dist = abs(p.y - y);
    float ink = 1.0 - smoothstep(half_ - aa, half_ + aa, dist);
    if (ink > 0.002) {
      vec3 col = colour < 0.5 ? texture(uTex, src).rgb : vec3(1.0);
      return vec4(mix(fill, col, ink), 1.0);
    }
    if (p.y < y) return vec4(fill, 1.0);
  }
  return vec4(fill, 1.0);
}
`,
};
