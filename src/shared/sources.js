// Catalog of modulation sources. Every external signal ends up as one of
// these: a number that is either unipolar (0..1) or bipolar (-1..1).

const def = (id, label, group, bipolar = false) => ({ id, label, group, bipolar });
// Vision sources only exist while their feature runs: they get a meter when
// they first report, and a mapping to one is inert until then.
const lazy = (id, label, group, bipolar = false) => ({ id, label, group, bipolar, lazy: true });

export const SOURCES = [
  def('phone.roll', 'Roll', 'Phone', true),
  def('phone.pitch', 'Pitch', 'Phone', true),
  def('phone.yaw', 'Yaw (compass)', 'Phone', true),
  def('phone.tiltX', 'Tilt left/right', 'Phone', true),
  def('phone.tiltY', 'Tilt forward/back', 'Phone', true),
  def('phone.spinX', 'Spin rate X', 'Phone', true),
  def('phone.spinY', 'Spin rate Y', 'Phone', true),
  def('phone.spinZ', 'Spin rate Z', 'Phone', true),
  def('phone.motion', 'Motion', 'Phone'),
  def('phone.shake', 'Shake', 'Phone'),
  def('pad.x', 'Pad X', 'Touch'),
  def('pad.y', 'Pad Y', 'Touch'),
  def('pad.touch', 'Pad touched', 'Touch'),
  def('trig.1', 'Trigger 1', 'Touch'),
  def('trig.2', 'Trigger 2', 'Touch'),
  def('trig.3', 'Trigger 3', 'Touch'),
  def('trig.4', 'Trigger 4', 'Touch'),
  def('lfo.1', 'LFO 1', 'LFO', true),
  def('lfo.2', 'LFO 2', 'LFO', true),
  def('lfo.3', 'LFO 3', 'LFO', true),
  def('lfo.4', 'LFO 4', 'LFO', true),
  def('tempo.beat', 'Beat pulse', 'Tempo'),
  def('tempo.phase', 'Beat ramp', 'Tempo'),
  def('tempo.bar', 'Bar ramp', 'Tempo'),
  def('audio.level', 'Level', 'Audio'),
  def('audio.bass', 'Bass', 'Audio'),
  def('audio.mid', 'Mid', 'Audio'),
  def('audio.high', 'High', 'Audio'),
  def('audio.beat', 'Beat', 'Audio'),

  lazy('face.present', 'Face seen', 'Face'),
  lazy('face.x', 'Position X', 'Face'),
  lazy('face.y', 'Position Y', 'Face'),
  lazy('face.size', 'Size (closeness)', 'Face'),
  lazy('face.yaw', 'Turn left/right', 'Face', true),
  lazy('face.pitch', 'Nod up/down', 'Face', true),
  lazy('face.roll', 'Head tilt', 'Face', true),
  lazy('face.jawOpen', 'Mouth open', 'Face'),
  lazy('face.smile', 'Smile', 'Face'),
  lazy('face.pucker', 'Pucker', 'Face'),
  lazy('face.browUp', 'Brows up', 'Face'),
  lazy('face.browDown', 'Brows down', 'Face'),
  lazy('face.blinkLeft', 'Blink left', 'Face'),
  lazy('face.blinkRight', 'Blink right', 'Face'),
  lazy('face.eyeWide', 'Eyes wide', 'Face'),
  lazy('face.cheekPuff', 'Cheek puff', 'Face'),

  lazy('hand.present', 'Hand seen', 'Hand'),
  lazy('hand.x', 'Position X', 'Hand'),
  lazy('hand.y', 'Position Y', 'Hand'),
  lazy('hand.pinch', 'Pinch', 'Hand'),
  lazy('hand.open', 'Openness', 'Hand'),
  lazy('hand.roll', 'Rotation', 'Hand', true),
  lazy('hand.distance', 'Two-hand distance', 'Hand'),

  lazy('gesture.fist', 'Fist', 'Gesture'),
  lazy('gesture.palm', 'Open palm', 'Gesture'),
  lazy('gesture.point', 'Pointing up', 'Gesture'),
  lazy('gesture.thumbUp', 'Thumb up', 'Gesture'),
  lazy('gesture.thumbDown', 'Thumb down', 'Gesture'),
  lazy('gesture.victory', 'Victory', 'Gesture'),
  lazy('gesture.love', 'I-love-you', 'Gesture'),

  lazy('pose.present', 'Body seen', 'Pose'),
  lazy('pose.x', 'Position X', 'Pose'),
  lazy('pose.y', 'Position Y', 'Pose'),
  lazy('pose.size', 'Size (closeness)', 'Pose'),
  lazy('pose.lean', 'Shoulder lean', 'Pose', true),
  lazy('pose.leftHandX', 'Left hand X', 'Pose'),
  lazy('pose.leftHandY', 'Left hand height', 'Pose'),
  lazy('pose.rightHandX', 'Right hand X', 'Pose'),
  lazy('pose.rightHandY', 'Right hand height', 'Pose'),
  lazy('pose.armSpan', 'Arm span', 'Pose'),

  lazy('seg.coverage', 'Person coverage', 'Segment'),
];

export const SOURCE_BY_ID = Object.fromEntries(SOURCES.map((s) => [s.id, s]));

// Sources created at run time (MIDI controls) are described from their id.
export function describeSource(id) {
  const known = SOURCE_BY_ID[id];
  if (known) return known;
  const cc = /^midi\.cc\.(\d+)\.(\d+)$/.exec(id);
  if (cc) return def(id, `Ch ${cc[1]} CC ${cc[2]}`, 'MIDI');
  const note = /^midi\.note\.(\d+)\.(\d+)$/.exec(id);
  if (note) return def(id, `Ch ${note[1]} note ${note[2]}`, 'MIDI');
  return def(id, id, 'Other');
}

export function sourceLabel(id) {
  const s = describeSource(id);
  return `${s.group} · ${s.label}`;
}

export const LFO_SHAPES = { Sine: 'sine', Triangle: 'triangle', 'Ramp up': 'saw', Square: 'square', 'Random steps': 'random', Drift: 'drift' };
export const LFO_COUNT = 4;
// Length of one LFO cycle in beats when locked to the tempo; 0 = free-running.
export const LFO_SYNC = { 'Free (rate in Hz)': 0, '4 bars': 16, '2 bars': 8, '1 bar': 4, '2 beats': 2, '1 beat': 1, '1/2 beat': 0.5, '1/4 beat': 0.25 };
