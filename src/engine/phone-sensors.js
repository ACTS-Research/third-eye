// Turns raw phone sensor packets into modulation sources.

import { FLAG_MOTION, FLAG_ORIENTATION, P, SENSOR_CHANNEL, TRIGGER_COUNT } from '../shared/protocol.js';
import { clamp } from '../shared/util.js';

const DEG = Math.PI / 180;
const SHAKE_THRESHOLD = 14; // m/s^2 of acceleration (gravity excluded)
const SHAKE_DECAY_S = 0.35;
const TIMEOUT_MS = 800;

function wrapPi(a) {
  return a - Math.PI * 2 * Math.round(a / (Math.PI * 2));
}

export class PhoneSensors {
  constructor(mod) {
    this.mod = mod;
    this.channel = null;
    this.lastSeq = -1;
    this.lastPacketAt = 0;
    this.packets = 0;
    this.rate = 0;
    this.counts = null;
    this.tapped = new Array(TRIGGER_COUNT).fill(false);
    this.held = 0;
    this.shake = 0;
    this.motion = 0;
    this.target = [0, 0, 0]; // roll, pitch, yaw in radians
    this.angles = [0, 0, 0]; // smoothed, fed to shaders as uPhone
    this.hasOrientation = false;
    this.hasMotion = false;
  }

  // Opens the unreliable sensor channel on a new data connection.
  attach(conn) {
    const pc = conn.peerConnection;
    if (!pc) return;
    try {
      const channel = pc.createDataChannel(SENSOR_CHANNEL.label, SENSOR_CHANNEL.options);
      channel.binaryType = 'arraybuffer';
      channel.onmessage = (e) => {
        if (e.data instanceof ArrayBuffer && e.data.byteLength >= P.LENGTH * 4) this.onPacket(new Float32Array(e.data));
      };
      this.channel = channel;
      this.lastSeq = -1;
      this.counts = null;
    } catch (err) {
      console.warn('[sensors] could not open the sensor channel', err);
    }
  }

  onPacket(f) {
    // Unordered channel: ignore anything older than what we already used.
    const seq = f[P.SEQ];
    if (seq <= this.lastSeq && this.lastSeq - seq < 600) return;
    this.lastSeq = seq;
    const now = performance.now();
    this.lastPacketAt = now;
    this.packets++;
    const mod = this.mod;
    const flags = f[P.FLAGS];
    this.hasOrientation = !!(flags & FLAG_ORIENTATION);
    this.hasMotion = !!(flags & FLAG_MOTION);

    if (this.hasOrientation) {
      const beta = f[P.BETA] * DEG;
      const gamma = f[P.GAMMA] * DEG;
      // "Up" expressed in the phone's own axes (x right, y top, z out of the
      // screen). Unlike raw beta/gamma this stays well behaved when the
      // phone is held upright to film.
      const ux = -Math.cos(beta) * Math.sin(gamma);
      const uy = Math.sin(beta);
      const uz = Math.cos(beta) * Math.cos(gamma);
      // Roll about the camera axis, relative to how iOS has already rotated
      // the picture (screen orientation).
      const roll = wrapPi(Math.atan2(ux, uy) - f[P.SCREEN] * DEG);
      const pitch = Math.asin(clamp(uz, -1, 1));
      const yaw = wrapPi(f[P.ALPHA] * DEG);
      this.target[0] = roll;
      this.target[1] = pitch;
      this.target[2] = yaw;
      mod.set('phone.roll', roll / Math.PI);
      mod.set('phone.pitch', pitch / (Math.PI / 2));
      mod.set('phone.yaw', yaw / Math.PI);
      mod.set('phone.tiltX', clamp(-ux, -1, 1));
      mod.set('phone.tiltY', clamp(uy, -1, 1));
    }

    if (this.hasMotion) {
      mod.set('phone.spinX', clamp(f[P.ROT_BETA] / 360, -1, 1));
      mod.set('phone.spinY', clamp(f[P.ROT_GAMMA] / 360, -1, 1));
      mod.set('phone.spinZ', clamp(f[P.ROT_ALPHA] / 360, -1, 1));
      const a = Math.hypot(f[P.ACC_X], f[P.ACC_Y], f[P.ACC_Z]);
      this.motion += (clamp(a / 12, 0, 1) - this.motion) * 0.25;
      if (a > SHAKE_THRESHOLD) this.shake = 1;
    }

    mod.set('pad.x', clamp(f[P.PAD_X], 0, 1));
    mod.set('pad.y', clamp(f[P.PAD_Y], 0, 1));
    mod.set('pad.touch', f[P.PAD_DOWN] > 0.5 ? 1 : 0);

    // Triggers: the mask says what is held now; the counters reveal taps
    // that started and ended between two packets.
    this.held = f[P.TRIG_MASK] | 0;
    const counts = [];
    for (let i = 0; i < TRIGGER_COUNT; i++) counts.push(f[P.TRIG_COUNT + i]);
    if (this.counts) {
      for (let i = 0; i < TRIGGER_COUNT; i++) {
        if (counts[i] !== this.counts[i]) this.tapped[i] = true;
      }
    }
    this.counts = counts;
  }

  // Called once per rendered frame.
  frame(dt, now) {
    const mod = this.mod;
    const alive = now - this.lastPacketAt < TIMEOUT_MS;
    if (!alive) this.held = 0; // never leave a gate stuck open

    // A tap is latched until a frame has seen it, however slow that frame is.
    for (let i = 0; i < TRIGGER_COUNT; i++) {
      const on = (this.held >> i) & 1 || this.tapped[i];
      this.tapped[i] = false;
      mod.set(`trig.${i + 1}`, on ? 1 : 0);
    }
    if (!alive) mod.set('pad.touch', 0);

    this.shake *= Math.exp(-dt / SHAKE_DECAY_S);
    if (!alive) this.motion *= Math.exp(-dt / 0.3);
    mod.set('phone.shake', this.shake);
    mod.set('phone.motion', this.motion);

    // Light smoothing for the angles shaders read directly.
    const k = 1 - Math.exp(-dt / 0.05);
    for (let i = 0; i < 3; i++) this.angles[i] = wrapPi(this.angles[i] + wrapPi(this.target[i] - this.angles[i]) * k);
  }

  // Packets per second since the last call.
  takeRate(dt) {
    this.rate = this.packets / dt;
    this.packets = 0;
    return this.rate;
  }

  status(now) {
    return {
      live: now - this.lastPacketAt < TIMEOUT_MS,
      hz: this.rate,
      orientation: this.hasOrientation,
      motion: this.hasMotion,
    };
  }
}
