// The picture keeps its own last output and lets it slide toward "down":
// real down from the phone's tilt (uPhone), turned by `angle`. Movement in
// the picture (the shared motion map) drags it along as well.
export default {
  id: 'gravity',
  name: 'Gravity',
  uses: { prev: true, motion: true },
  params: {
    // How far it falls each frame, as a share of the picture's height.
    pull: { min: 0, max: 0.08, default: 0.006, step: 0.0005, curve: 3 },
    // How strongly movement in the picture carries it along.
    drag: { min: 0, max: 2, default: 0.5, step: 0.01, curve: 2 },
    // How much of what has fallen stays, per frame.
    hold: { min: 0, max: 1, default: 0.96, step: 0.001, curve: 3, from: 'max' },
    // Turns "down", in turns. With no phone, 0 is the foot of the picture.
    angle: { min: -0.5, max: 0.5, default: 0, step: 0.005 },
    spread: { min: 0, max: 1, default: 0.2, step: 0.005, curve: 2 },
    blend: { options: { Pour: 0, 'Bright falls': 1, 'Dark falls': 2 }, default: 0 },
  },
  frag: /* glsl */ `
vec4 effect(vec2 uv) {
  // Down in the picture: a phone rolled on its side turns it, and a phone
  // laid flat (pointing at the floor or the ceiling) has none.
  vec2 down = rot2(uPhone.x + angle * TAU) * vec2(0.0, -1.0) * cos(uPhone.y);
  down.x /= ASPECT;
  vec4 m = motionAt(uMotion, uv);
  vec2 carry = down * pull + m.zw * FLOW_RANGE * drag * smoothstep(0.02, 0.2, m.y);
  // What is here now was up there a frame ago.
  vec2 from = uv - carry;
  vec2 side = vec2(-down.y, down.x * ASPECT) * vec2(1.0 / ASPECT, 1.0) * spread * 0.01;
  vec3 fb = spread > 0.0
    ? texture(uPrev, from).rgb * 0.5 + (texture(uPrev, from + side).rgb + texture(uPrev, from - side).rgb) * 0.25
    : texture(uPrev, from).rgb;
  fb *= inFrame(from);
  vec3 live = texture(uTex, uv).rgb;
  vec3 col;
  if (blend < 0.5) col = mix(live, fb, hold * inFrame(from));
  else if (blend < 1.5) col = max(live, fb * hold - 0.003);
  else col = min(live, 1.0 - (1.0 - mix(vec3(1.0), fb, inFrame(from))) * hold + 0.003);
  return vec4(clamp(col, 0.0, 1.0), 1.0);
}
`,
};
