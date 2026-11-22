// Tone. Brightness, contrast and colour in one place, with a two-colour
// tint: the dark parts take one colour, the bright parts another.
export default {
  id: 'tone',
  name: 'Tone',
  params: {
    // In stops: the far left is an eighth of the light, the far right eight times.
    exposure: { min: -1, max: 1, default: 0, step: 0.005 },
    // Mid-slider is the picture as it is. Left of that it flattens to grey
    // and then turns over into a negative.
    contrast: { min: -2, max: 4, default: 1.2, step: 0.01, curve: 1.5, center: 1 },
    saturation: { min: 0, max: 4, default: 1, step: 0.01, curve: 1.5, center: 1 },
    // Half a turn of the colour circle either way.
    hue: { min: -0.5, max: 0.5, default: 0, step: 0.005 },
    // The tint: a colour for the dark parts, a colour for the bright parts,
    // and how much of the picture's own colour they replace.
    shadows: { min: 0, max: 1, default: 0.62, step: 0.005, look: 'hue' },
    highlights: { min: 0, max: 1, default: 0.1, step: 0.005, look: 'hue' },
    tint: { min: 0, max: 1, default: 0, step: 0.005 },
  },
  frag: /* glsl */ `
vec4 effect(vec2 uv) {
  vec3 c = texture(uTex, uv).rgb;
  c *= pow(2.0, exposure * 3.0);
  c = (c - 0.5) * contrast + 0.5;
  c = clamp(c, 0.0, 1.0);
  c = mix(vec3(luma(c)), c, saturation);
  c = clamp(hueRotate(c, hue), 0.0, 1.0);
  // Black, the shadow colour, the highlight colour, white.
  float l = luma(c);
  vec3 dark = hsv2rgb(vec3(shadows, 0.9, 0.6));
  vec3 light = hsv2rgb(vec3(highlights, 0.7, 1.0));
  vec3 toned = l < 0.3 ? mix(vec3(0.0), dark, l / 0.3)
    : l < 0.75 ? mix(dark, light, (l - 0.3) / 0.45)
    : mix(light, vec3(1.0), (l - 0.75) / 0.25);
  return vec4(mix(c, toned, tint), 1.0);
}
`,
};
