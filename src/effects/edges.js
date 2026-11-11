export default {
  id: 'edges',
  name: 'Edge Glow',
  params: {
    gain: { min: 0, max: 8, default: 2.5, step: 0.01 },
    threshold: { min: 0, max: 1, default: 0.08, step: 0.005 },
    width: { min: 0.5, max: 8, default: 1.5, step: 0.1 },
    glow: { min: 0, max: 2, default: 0.8, step: 0.01 },
    hue: { min: 0, max: 1, default: 0.5, step: 0.005 },
    rainbow: { min: 0, max: 1, default: 0.3, step: 0.01 },
    background: { min: 0, max: 1, default: 0.15, step: 0.01 },
  },
  frag: /* glsl */ `
// Sobel gradient of brightness at a given pixel radius.
vec2 sobel(vec2 uv, float r) {
  vec2 px = r / uResolution;
  float tl = luma(texture(uTex, uv + px * vec2(-1.0, 1.0)).rgb);
  float t  = luma(texture(uTex, uv + px * vec2(0.0, 1.0)).rgb);
  float tr = luma(texture(uTex, uv + px * vec2(1.0, 1.0)).rgb);
  float l  = luma(texture(uTex, uv + px * vec2(-1.0, 0.0)).rgb);
  float rr = luma(texture(uTex, uv + px * vec2(1.0, 0.0)).rgb);
  float bl = luma(texture(uTex, uv + px * vec2(-1.0, -1.0)).rgb);
  float b  = luma(texture(uTex, uv + px * vec2(0.0, -1.0)).rgb);
  float br = luma(texture(uTex, uv + px * vec2(1.0, -1.0)).rgb);
  return vec2(tr + 2.0 * rr + br - tl - 2.0 * l - bl, tl + 2.0 * t + tr - bl - 2.0 * b - br);
}

vec4 effect(vec2 uv) {
  vec2 g = sobel(uv, width);
  float sharp = max(length(g) - threshold, 0.0);
  // A second, wider pass gives the line a soft halo.
  float halo = max(length(sobel(uv, width * 3.5)) - threshold, 0.0);
  float e = (sharp + halo * glow) * gain;
  float h = hue + rainbow * atan(g.y, g.x) / TAU;
  vec3 tint = hsv2rgb(vec3(fract(h), 0.85, 1.0));
  vec3 base = texture(uTex, uv).rgb * background;
  return vec4(clamp(base + tint * e, 0.0, 1.0), 1.0);
}
`,
};
