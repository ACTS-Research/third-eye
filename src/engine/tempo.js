// The tempo. Taps set the BPM (average of the recent intervals) and the
// downbeat (the last tap). Published as modulation sources, and as the beat
// position that tempo-synced LFOs lock to.
//
// MIDI clock (state.midi.clock; the arithmetic is in clock.js):
//   follow  while pulses arrive from another device, the speed and the beat
//           are that clock's. The show's own tempo (state.tempo.bpm) is not
//           touched, and takes over, from the beat the clock had reached,
//           when the pulses stop arriving.
//   send    the app's own tempo and beats go out as a clock; Start and Stop
//           on request (`toggleRun`).

import { ClockIn, ClockOut } from './clock.js';

const RESET_MS = 2000; // a longer pause starts a new count
const MAX_TAPS = 8;
const PULSE_DECAY_BEATS = 0.35;
// Pulses are handed to the browser this far ahead of when they leave. The
// frames do it; a timer does it too, in case a frame is long in coming. A
// change of tempo or a tap reaches the wire at most this much later.
const AHEAD_MS = 250;
const TIMER_MS = 100;

export class Tempo {
  constructor(mod, store, midi = null) {
    this.mod = mod;
    this.store = store;
    this.midi = midi;
    this.taps = [];
    this.anchor = performance.now(); // time of beat zero
    this.clockIn = new ClockIn();
    this.clockOut = new ClockOut();
    this.wasFollowing = false;
    this.timer = 0;
    this.sendClock = (bytes, at) => this.midi?.send(this.store.state.midi.clockOut, bytes, at) ?? false;
    if (midi) {
      midi.onClock = (status, data, at, port) => {
        const { clock, clockIn } = this.store.state.midi;
        if (clock === 'follow' && (!clockIn || clockIn === port)) this.clockIn.message(status, data, at, port);
      };
    }
  }

  get mode() {
    return this.store.state.midi.enabled ? this.store.state.midi.clock : 'off';
  }

  // A clock is being followed and is arriving.
  following(now) {
    return this.mode === 'follow' && this.clockIn.alive(now);
  }

  get bpm() {
    return this.following(performance.now()) ? this.clockIn.bpm : this.store.state.tempo.bpm;
  }

  // `at` is the tap's Date.now() in whichever window it happened.
  tap(at) {
    // (The beat is another device's: there is nothing to tap.)
    if (this.following(performance.now())) return;
    const t = performance.now() - (Date.now() - at);
    if (this.taps.length && t - this.taps.at(-1) > RESET_MS) this.taps = [];
    this.taps.push(t);
    if (this.taps.length > MAX_TAPS) this.taps.shift();
    // Every tap is a downbeat; from the second on it also sets the speed.
    this.anchor = t;
    if (this.taps.length >= 2) {
      const interval = (this.taps.at(-1) - this.taps[0]) / (this.taps.length - 1);
      const bpm = Math.min(300, Math.max(30, 60000 / interval));
      // (`by`: this tempo was worked out by the engine, which keeps no list
      // of shows. /control stores it in the live show, whichever window the
      // engine is in.)
      this.store.dispatch({ op: 'merge', key: 'tempo', patch: { bpm: Math.round(bpm * 10) / 10 }, by: 'engine' });
    }
  }

  // Beats since the downbeat (fractional).
  beats(now) {
    if (this.following(now)) {
      // The offset moves the followed beat earlier (-) or later (+).
      const offset = this.store.state.midi.clockOffset || 0;
      return this.clockIn.beats(now) - (offset / 60000) * this.clockIn.bpm;
    }
    return ((now - this.anchor) / 60000) * this.store.state.tempo.bpm;
  }

  frame(now) {
    const following = this.following(now);
    if (this.wasFollowing && !following) {
      // The clock has stopped arriving: the show's own tempo carries on
      // from the beat the clock had reached.
      const offset = this.store.state.midi.clockOffset || 0;
      const reached = this.clockIn.beats(now) - (offset / 60000) * (this.clockIn.bpm || 0);
      this.anchor = now - (reached * 60000) / this.store.state.tempo.bpm;
    }
    this.wasFollowing = following;
    if (this.mode !== 'follow' && this.clockIn.lastAt > -Infinity) this.clockIn.reset();
    this.pumpOut(now);
    const b = this.beats(now);
    const phase = b - Math.floor(b);
    this.mod.set('tempo.phase', phase);
    this.mod.set('tempo.beat', Math.max(0, 1 - phase / PULSE_DECAY_BEATS));
    this.mod.set('tempo.bar', (((b / 4) % 1) + 1) % 1);
    return b;
  }

  // ------------------------------------------------------------ sending ---
  // 'ok', 'none' (no device chosen) or 'missing' (chosen, not connected).
  outState() {
    const name = this.store.state.midi.clockOut;
    if (!name) return 'none';
    return this.midi?.outputs().some((o) => o.name === name) ? 'ok' : 'missing';
  }

  pumpOut(now) {
    if (this.mode !== 'send') {
      if (this.timer) {
        clearInterval(this.timer);
        this.timer = 0;
      }
      // Sending was switched off with a sequencer started: tell it to stop.
      if (this.clockOut.started || this.clockOut.wantStart) this.clockOut.stop(now, this.sendClock);
      if (this.clockOut.last > -Infinity) this.clockOut.reset();
      return;
    }
    this.timer ||= setInterval(() => this.pumpOut(performance.now()), TIMER_MS);
    if (this.outState() !== 'ok') return;
    this.clockOut.pump(now, this.store.state.tempo.bpm, this.anchor, this.sendClock, AHEAD_MS);
  }

  // Start, on the next beat; or, once started or asked for, Stop.
  toggleRun() {
    if (this.mode !== 'send') return;
    if (this.clockOut.started || this.clockOut.wantStart) this.clockOut.stop(performance.now(), this.sendClock);
    else this.clockOut.start();
  }

  // The engine is stopping (the picture is moving to another window): a
  // sequencer that was started is told to stop, and nothing is left running.
  release() {
    if (this.timer) clearInterval(this.timer);
    this.timer = 0;
    if (this.clockOut.started) this.clockOut.stop(performance.now(), this.sendClock);
    this.clockOut.reset();
    this.clockIn.reset();
    this.wasFollowing = false;
  }

  clockStatus(now) {
    const mode = this.mode;
    const alive = mode === 'follow' && this.clockIn.alive(now);
    return {
      mode,
      alive,
      running: alive && this.clockIn.running,
      bpm: alive ? Math.round(this.clockIn.bpm * 10) / 10 : 0,
      port: alive ? this.clockIn.port : '',
      out: mode === 'send' ? this.outState() : '',
      started: this.clockOut.started,
      starting: this.clockOut.wantStart,
      pulses: this.clockOut.pulses,
    };
  }
}
