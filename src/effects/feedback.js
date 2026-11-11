export default {
  id: 'feedback',
  name: 'Video Feedback',
  uses: { prev: true },
  params: {
    zoom: { min: 0.8, max: 1.25, default: 1.03, step: 0.001 },
    rotate: { min: -0.2, max: 0.2, default: 0.01, step: 0.001 },
    decay: { min: 0.5, max: 1.0, default: 0.94, step: 0.001 },
    shiftX: { min: -0.05, max: 0.05, default: 0, step: 0.0005 },
    shiftY: { min: -0.05, max: 0.05, default: 0, step: 0.0005 },
    hue: { min: -0.1, max: 0.1, default: 0.005, step: 0.001 },
    key: { min: 0, max: 1, default: 0.35, step: 0.01 },
    blend: { options: { Lighten: 0, Add: 1, 'Luma key': 2, Screen: 3 }, default: 0 },
  },
  frag: /* glsl */ `
vec4 effect(vec2 uv) {
  // Sample the previous output through a small zoom / rotate / shift so the
  // image spirals into itself frame after frame.
  vec2 p = uv - 0.5;
  p.x *= ASPECT;
  p = rot2(rotate) * p / zoom;
  p.x /= ASPECT;
  vec2 fuv = p + 0.5 - vec2(shiftX, shiftY);

  // The small constant makes 8-bit feedback actually reach black.
  vec3 fb = max(texture(uPrev, fuv).rgb * inFrame(fuv) * decay - 0.003, 0.0);
  fb = clamp(hueRotate(fb, hue), 0.0, 1.0);

  vec3 live = texture(uTex, uv).rgb;
  vec3 col;
  if (blend < 0.5) {
    col = max(live, fb);
  } else if (blend < 1.5) {
    col = live + fb * 0.9;
  } else if (blend < 2.5) {
    float k = smoothstep(key - 0.08, key + 0.08, luma(live));
    col = mix(fb, live, k);
  } else {
    col = 1.0 - (1.0 - live) * (1.0 - fb);
  }
  return vec4(clamp(col, 0.0, 1.0), 1.0);
}
`,
};
