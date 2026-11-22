// Blur / Glow. One wide blur, made from the smaller copies of the picture
// (uTexMip) so it costs the same at any size, and three things done with it:
// soften (or, the other way, sharpen), glow, and a streak along an angle.
export default {
  id: 'blur',
  name: 'Blur / Glow',
  uses: { mips: true },
  params: {
    // How wide: from a pixel or two to a third of the picture.
    size: { min: 0, max: 1, default: 0.35, step: 0.005 },
    // Right of centre the picture gives way to the blur; left of centre the
    // blur is taken away from it, which sharpens and then haloes.
    soften: { min: -1, max: 1, default: 1, step: 0.005 },
    // The blurred highlights added back over the picture.
    glow: { min: 0, max: 1, default: 0, step: 0.005 },
    // 0 is round; towards 1 the blur becomes a streak along the angle.
    stretch: { min: 0, max: 1, default: 0, step: 0.005 },
    angle: { min: -0.5, max: 0.5, default: 0, step: 0.005 },
  },
  frag: /* glsl */ `
vec4 effect(vec2 uv) {
  vec3 pic = texture(uTex, uv).rgb;
  float r = 0.002 + 0.36 * size * size;            // radius, in picture heights
  // Read the copy whose pixels are about as wide as the blur, at four
  // points half a pixel of that copy apart: a few reads give a smooth, wide
  // blur.
  float rm = r * float(textureSize(uTexMip, 0).y);  // radius, in the copy's pixels
  float lod = log2(max(1.0, rm));
  vec3 sum = textureLod(uTexMip, uv, lod).rgb;
  for (int i = 0; i < 4; i++) {
    vec2 o = vec2(i < 2 ? -0.5 : 0.5, (i & 1) == 0 ? -0.5 : 0.5) * r;
    o.x /= ASPECT;
    sum += textureLod(uTexMip, clamp(uv + o, 0.0, 1.0), lod).rgb;
  }
  vec3 soft = sum / 5.0;
  // A streak is a second blur, four times as long as it is wide, laid along
  // the angle; stretch fades from the round one to it.
  if (stretch > 0.005) {
    vec2 along = vec2(cos(angle * TAU), sin(angle * TAU));
    vec3 line = vec3(0.0);
    float total = 0.0;
    for (int i = 0; i < 9; i++) {
      float t = float(i) / 4.0 - 1.0;
      vec2 o = along * t * 4.0 * r;
      o.x /= ASPECT;
      float w = 1.0 - 0.8 * abs(t);
      line += textureLod(uTexMip, clamp(uv + o, 0.0, 1.0), lod).rgb * w;
      total += w;
    }
    soft = mix(soft, line / total, stretch);
  }
  vec3 col = soften >= 0.0 ? mix(pic, soft, soften) : pic + (pic - soft) * (-soften) * 4.0;
  col += soft * soft * glow * 2.5;
  return vec4(clamp(col, 0.0, 1.0), 1.0);
}
`,
};
