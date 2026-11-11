// Catalog of modulation sources. Every external signal ends up as one of
// these: a number that is either unipolar (0..1) or bipolar (-1..1).

const def = (id, label, group, bipolar = false) => ({ id, label, group, bipolar });

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
