// Tap tempo. Taps set the BPM (average of the recent intervals) and the
// downbeat (the last tap). Published as modulation sources, and as the beat
// position that tempo-synced LFOs lock to.

const RESET_MS = 2000; // a longer pause starts a new count
const MAX_TAPS = 8;
const PULSE_DECAY_BEATS = 0.35;

export class Tempo {
  constructor(mod, store) {
    this.mod = mod;
    this.store = store;
    this.taps = [];
    this.anchor = performance.now(); // time of beat zero
  }

  get bpm() {
    return this.store.state.tempo.bpm;
  }

  // `at` is the tap's Date.now() in whichever window it happened.
  tap(at) {
    const t = performance.now() - (Date.now() - at);
    if (this.taps.length && t - this.taps.at(-1) > RESET_MS) this.taps = [];
    this.taps.push(t);
    if (this.taps.length > MAX_TAPS) this.taps.shift();
    // Every tap is a downbeat; from the second on it also sets the speed.
    this.anchor = t;
    if (this.taps.length >= 2) {
      const interval = (this.taps.at(-1) - this.taps[0]) / (this.taps.length - 1);
      const bpm = Math.min(300, Math.max(30, 60000 / interval));
      this.store.merge('tempo', { bpm: Math.round(bpm * 10) / 10 });
    }
  }

  // Beats since the downbeat (fractional).
  beats(now) {
    return ((now - this.anchor) / 60000) * this.bpm;
  }

  frame(now) {
    const b = this.beats(now);
    const phase = b - Math.floor(b);
    this.mod.set('tempo.phase', phase);
    this.mod.set('tempo.beat', Math.max(0, 1 - phase / PULSE_DECAY_BEATS));
    this.mod.set('tempo.bar', (b / 4) % 1);
    return b;
  }
}
