// Phone -> Mac sensor packets. They travel on a second RTCDataChannel that is
// unordered with no retransmits: a late sample is worthless, so it is dropped
// rather than queued. Each packet is a Float32Array carrying the complete
// controller state, which makes any single loss harmless.

export const SENSOR_CHANNEL = Object.freeze({
  label: 'sensors',
  // Negotiated out of band with a fixed id so PeerJS never sees this channel.
  options: Object.freeze({ negotiated: true, id: 42, ordered: false, maxRetransmits: 0 }),
});

export const SENSOR_HZ = 60;

export const P = Object.freeze({
  SEQ: 0,
  FLAGS: 1, // bit 0: orientation valid, bit 1: motion valid
  ALPHA: 2, // deviceorientation, degrees
  BETA: 3,
  GAMMA: 4,
  ROT_ALPHA: 5, // rotationRate, degrees / second
  ROT_BETA: 6,
  ROT_GAMMA: 7,
  ACC_X: 8, // acceleration without gravity, m/s^2
  ACC_Y: 9,
  ACC_Z: 10,
  SCREEN: 11, // screen orientation angle, degrees
  PAD_X: 12, // 0..1
  PAD_Y: 13,
  PAD_DOWN: 14,
  TRIG_MASK: 15, // bit n set while trigger n is held
  TRIG_COUNT: 16, // 16..19: presses so far, so a tap between packets is not lost
  // Degrees (0, 90, 180, 270) the Mac turns the camera frames anticlockwise:
  // the phone's Rotate button. Older phone pages do not send it; it then
  // counts as 0.
  TURN: 20,
  LENGTH: 21,
  MIN_LENGTH: 20,
});

export const FLAG_ORIENTATION = 1;
export const FLAG_MOTION = 2;
export const TRIGGER_COUNT = 4;
