export default {
  id: 'kaleido',
  name: 'Kaleidoscope / Mirror',
  params: {
    mode: { options: { Kaleidoscope: 0, 'Mirror left/right': 1, 'Mirror top/bottom': 2, 'Mirror quad': 3 }, default: 0 },
    segments: { min: 1, max: 24, default: 6, step: 1 },
    angle: { min: -1, max: 1, default: 0, step: 0.001 },
    spin: { min: -1, max: 1, default: 0.05, step: 0.001 },
    zoom: { min: 0.25, max: 4, default: 1, step: 0.01 },
    centerX: { min: 0, max: 1, default: 0.5, step: 0.001 },
    centerY: { min: 0, max: 1, default: 0.5, step: 0.001 },
  },
  frag: /* glsl */ `
vec4 effect(vec2 uv) {
  vec2 c = vec2(centerX, centerY);
  vec2 p = uv - c;
  p.x *= ASPECT;

  if (mode < 0.5) {
    float seg = TAU / max(1.0, floor(segments + 0.5));
    float a = atan(p.y, p.x) + angle * PI + uTime * spin;
    float r = length(p);
    a = abs(mod(a, seg) - seg * 0.5);
    p = r * vec2(cos(a), sin(a));
  } else {
    p = rot2(angle * PI + uTime * spin) * p;
    if (mode < 1.5) p.x = -abs(p.x);
    else if (mode < 2.5) p.y = -abs(p.y);
    else p = -abs(p);
  }

  p /= zoom;
  p.x /= ASPECT;
  return texture(uTex, mirrorUv(p + c));
}
`,
};
