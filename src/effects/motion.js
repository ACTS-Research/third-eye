// Shows only what moves, or only what is still. Reads the shared motion map
// (engine/motion.js); its own previous output carries the picture it holds
// and, in alpha, how recently each point moved.
export default {
  id: 'motion',
  name: 'Motion',
  uses: { prev: true, motion: true },
  params: {
    show: { options: { 'What moves': 0, 'What is still': 1 }, default: 0 },
    // How little movement counts.
    sensitivity: { min: 0, max: 1, default: 0.6, step: 0.005 },
    softness: { min: 0, max: 1, default: 0.3, step: 0.005 },
    // How long a point that moved goes on counting as moving, per frame.
    memory: { min: 0, max: 0.999, default: 0.92, step: 0.001, curve: 3, from: 'max' },
    // What fills the rest of the picture.
    rest: { options: { Black: 0, 'Held picture': 1, Dimmed: 2 }, default: 0 },
    source: { label: 'movement of', options: { 'Input A': 0, 'Input B': 1 }, default: 0 },
  },
  frag: /* glsl */ `
vec4 effect(vec2 uv) {
  vec4 m = source < 0.5 ? motionAt(uMotion, uv) : motionAt(uMotionB, uv);
  float s = 1.0 - sensitivity;
  float lo = 0.01 + s * s * 0.6;
  float moving = smoothstep(lo, lo + 0.02 + softness * 0.5, m.x);
  vec4 before = texture(uPrev, uv);
  moving = max(moving, before.a * memory - 0.004);
  float sel = show < 0.5 ? moving : 1.0 - moving;
  vec3 live = texture(uTex, uv).rgb;
  vec3 other = rest < 0.5 ? vec3(0.0) : rest < 1.5 ? before.rgb : live * 0.2;
  return vec4(mix(other, live, sel), moving);
}
`,
};
