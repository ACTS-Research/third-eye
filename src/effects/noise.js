// Noise. Video static that takes the picture over speck by speck: a little
// is grain, all the way is nothing but static. The same speckle as the logo.
export default {
  id: 'noise',
  name: 'Noise',
  params: {
    // How much of the picture the static has eaten.
    amount: { min: 0, max: 1, default: 0.3, step: 0.005 },
    // From single pixels to blocks an eighth of the picture high.
    grain: { min: 0, max: 1, default: 0.1, step: 0.005 },
    // 0 is frozen; 1 changes on every frame.
    speed: { min: 0, max: 1, default: 1, step: 0.005 },
    // 0 is black-and-white static, 1 is coloured.
    colour: { min: 0, max: 1, default: 0, step: 0.005 },
    // Where it bites first: right, the bright parts; left, the dark parts.
    bite: { min: -1, max: 1, default: 0, step: 0.005 },
  },
  frag: /* glsl */ `
// Three even random numbers for a whole-numbered place (pcg3d). The shared
// hash21 is made for smooth positions and shows a weave on a grid of cells.
vec3 flakes(vec3 at) {
  uvec3 v = uvec3(ivec3(at));
  v = v * 1664525u + 1013904223u;
  v.x += v.y * v.z; v.y += v.z * v.x; v.z += v.x * v.y;
  v ^= v >> 16u;
  v.x += v.y * v.z; v.y += v.z * v.x; v.z += v.x * v.y;
  return vec3(v) / 4294967295.0;
}

vec4 effect(vec2 uv) {
  float cell = pow(2.0, grain * 6.5) * uResolution.y / 720.0;
  vec2 id = floor(uv * uResolution / cell);
  float tick = mod(floor(uTime * 60.0 * speed * speed), 4093.0);
  vec3 one = flakes(vec3(id, tick));
  vec3 two = flakes(vec3(id, tick + 4099.0));
  vec3 pic = texture(uTex, uv).rgb;
  vec3 flake = mix(vec3(one.x), two, colour);
  float l = luma(cell > 1.5 ? texture(uTex, (id + 0.5) * cell / uResolution).rgb : pic);
  float where = bite >= 0.0 ? mix(1.0, l * l * 2.0, bite) : mix(1.0, (1.0 - l) * (1.0 - l) * 2.0, -bite);
  float eaten = step(one.y, pow(amount, 1.5) * where + step(1.0, amount));
  return vec4(mix(pic, flake, eaten), 1.0);
}
`,
};
