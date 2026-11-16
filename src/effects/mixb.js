// Mixes input B into the picture. Its wet / dry is the mix itself (the bar
// under the picture on the perform screen moves it); with input B off the
// engine skips the effect and A passes through.
export default {
  id: 'mixb',
  name: 'Mix B',
  mixLabel: 'mix',
  uses: { inputB: true },
  params: {
    mode: {
      // Shown as a grid of buttons, not a menu.
      grid: true,
      options: { Fade: 0, Add: 1, Screen: 2, Multiply: 3, Difference: 4, 'Bright key': 5, 'Colour key': 6, Wipe: 7, 'B pushes A': 8 },
      default: 0,
    },
    // Bright key: how bright B must be to show. Colour key: how far from the
    // key colour. Wipe: where the edge is. B pushes A: how far.
    level: { min: 0, max: 1, default: 0.5, step: 0.005 },
    softness: { min: 0, max: 1, default: 0.1, step: 0.005 },
    // Wipe and B pushes A: the direction, in turns.
    angle: { min: -0.5, max: 0.5, default: 0, step: 0.005 },
    keyHue: { label: 'key colour', min: 0, max: 1, default: 0.33, step: 0.005 },
  },
  frag: /* glsl */ `
vec4 effect(vec2 uv) {
  vec3 a = texture(uTex, uv).rgb;
  vec3 b = texture(uTexB, uv).rgb;
  float soft = max(softness * 0.5, 0.001);
  vec3 c;
  if (mode < 0.5) c = b;
  else if (mode < 1.5) c = min(a + b, 1.0);
  else if (mode < 2.5) c = 1.0 - (1.0 - a) * (1.0 - b);
  else if (mode < 3.5) c = a * b;
  else if (mode < 4.5) c = abs(a - b);
  else if (mode < 5.5) {
    // B shows where it is brighter than the level.
    c = mix(a, b, smoothstep(level - soft, level + soft, luma(b)));
  } else if (mode < 6.5) {
    // B shows except where it is the key colour (a green screen, say).
    vec3 hsv = rgb2hsv(b);
    float away = abs(fract(hsv.x - keyHue + 0.5) - 0.5) * 2.0;
    // Greys and near-blacks have no colour to key on: they stay.
    float keyed = (1.0 - smoothstep(level * 0.5 - soft, level * 0.5 + soft, away)) * smoothstep(0.1, 0.3, hsv.y) * smoothstep(0.05, 0.2, hsv.z);
    c = mix(b, a, keyed);
  } else if (mode < 7.5) {
    // An edge across the picture: B on one side of it, A on the other.
    vec2 dir = vec2(cos(angle * TAU), sin(angle * TAU));
    float reach = 0.5 * (abs(dir.x) + abs(dir.y));
    float along = dot(uv - 0.5, dir) / reach * 0.5 + 0.5;
    float edge = mix(-soft, 1.0 + soft, level);
    c = mix(a, b, 1.0 - smoothstep(edge - soft, edge + soft, along));
  } else {
    // B is not seen: its brightness pushes A's pixels along the angle.
    vec2 dir = vec2(cos(angle * TAU), sin(angle * TAU)) * vec2(1.0 / ASPECT, 1.0);
    c = texture(uTex, mirrorUv(uv + dir * (luma(b) - 0.5) * level * 0.5)).rgb;
  }
  return vec4(c, 1.0);
}
`,
};
