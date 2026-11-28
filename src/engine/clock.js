// MIDI clock, both ways. A clock is 24 pulses to a beat (0xF8), with Start
// (0xFA), Continue (0xFB), Stop (0xFC) and, from some devices, a Song
// Position (0xF2). It carries a speed and where the beats fall; it does not
// say where a bar begins, except that Start is beat one.
//
// Nothing here touches a MIDI port, the page or the state: `ClockIn` is fed
// messages with their time stamps and `ClockOut` is handed a `send`. All
// times are milliseconds on the page's own clock (`performance.now()`),
// which is what a MIDI message's time stamp and a timed send both use.

export const PPQ = 24;
export const PULSE = 0xf8;
export const START = 0xfa;
export const CONTINUE = 0xfb;
export const STOP = 0xfc;
export const POSITION = 0xf2;

// True for the messages a clock is made of (the rest are notes and knobs).
export const isClockMessage = (status) => status === PULSE || status === START || status === CONTINUE || status === STOP || status === POSITION;

const MIN_BPM = 30;
const MAX_BPM = 300;
// Longer than this without a pulse and the clock has stopped arriving (at
// 30 BPM, the slowest, pulses are 83 ms apart).
export const GAP_MS = 400;
// The speed is read over the last two beats of pulses, and first given
// after half a beat.
const WINDOW = PPQ * 2 + 1;
const ENOUGH = PPQ / 2 + 1;
// A pulse this far off the measured spacing, the same way three times
// running, is a new speed and not a wobble: the old pulses are dropped so it
// is taken up at once.
const OFF = 0.2;
const OFF_RUN = 3;

// A clock coming in from another device.
export class ClockIn {
  constructor() {
    this.reset();
  }

  reset() {
    this.times = []; // when the last pulses arrived
    this.ticks = 0; // pulses since Start (or since the first one heard)
    this.next = null; // the tick the next pulse is, after Start or a Song Position
    this.lastAt = -Infinity;
    this.bpm = 0; // 0 until enough pulses have been heard
    this.running = true; // false between Stop and Start / Continue
    this.port = ''; // the device the last pulse came from
    this.off = 0;
  }

  // One message: its status byte, its bytes, when it arrived and from where.
  message(status, data, at, port = '') {
    if (status === PULSE) {
      this.port = port;
      this.pulse(at);
    } else if (status === START) {
      // The pulse after Start is the first of beat one.
      this.next = 0;
      this.running = true;
    } else if (status === CONTINUE) this.running = true;
    else if (status === STOP) this.running = false;
    else if (status === POSITION && data.length >= 3) {
      // Counted in sixteenth notes: six pulses each.
      this.next = ((data[1] & 0x7f) | ((data[2] & 0x7f) << 7)) * 6;
    }
  }

  pulse(at) {
    if (this.next !== null) {
      this.ticks = this.next;
      this.next = null;
    } else this.ticks++;
    const last = this.times.at(-1);
    if (last !== undefined && at - last > GAP_MS) {
      // It had stopped arriving: what was heard before says nothing now.
      this.times = [];
      this.bpm = 0;
      this.off = 0;
    } else if (this.times.length >= 4) {
      // (Counted by direction: a wobble comes early then late, a new speed
      // is early every time, or late every time.)
      const usual = (last - this.times[0]) / (this.times.length - 1);
      const by = at - last - usual;
      const way = by > usual * OFF ? 1 : by < -usual * OFF ? -1 : 0;
      this.off = way && Math.sign(this.off) === way ? this.off + way : way;
      if (Math.abs(this.off) >= OFF_RUN) {
        this.times = this.times.slice(-(OFF_RUN - 1));
        this.off = 0;
      }
    }
    this.times.push(at);
    if (this.times.length > WINDOW) this.times.shift();
    this.lastAt = at;
    if (this.times.length >= ENOUGH || (this.bpm && this.times.length >= OFF_RUN)) {
      const spacing = (at - this.times[0]) / (this.times.length - 1);
      if (spacing > 0) this.bpm = Math.min(MAX_BPM, Math.max(MIN_BPM, 60000 / (spacing * PPQ)));
    }
  }

  // Pulses are arriving and their speed is known.
  alive(now) {
    return this.bpm > 0 && now - this.lastAt < GAP_MS;
  }

  // Beats since Start, with the part of a pulse that has passed since the
  // last one (never more than one pulse: a late pulse holds the beat still
  // instead of letting it run on and jump back).
  beats(now) {
    if (!this.bpm) return this.ticks / PPQ;
    const part = Math.min(1, Math.max(0, (now - this.lastAt) / (60000 / (this.bpm * PPQ))));
    return (this.ticks + part) / PPQ;
  }
}

// A clock going out to other devices, at the app's own tempo and on its own
// beats: beat n falls at `anchor + n * 60000 / bpm`, the same as the app's
// LFOs and beat pulse (engine/tempo.js).
export class ClockOut {
  constructor() {
    this.reset();
  }

  reset() {
    this.last = -Infinity; // the time of the last pulse handed over
    this.started = false; // Start has been sent and Stop has not
    this.wantStart = false; // Start is to go out on the next beat
    this.pulses = 0;
  }

  // Asks for Start: it goes out on the app's next beat, so that a sequencer
  // at the other end begins its bar there.
  start() {
    this.wantStart = true;
  }

  // Stop goes out at once. The pulses carry on, as most devices expect.
  stop(now, send) {
    this.wantStart = false;
    if (!this.started) return;
    this.started = false;
    send([STOP], now);
  }

  // Hands over every pulse due before `now + ahead`, each with the time it
  // is to leave at, so the timing is the browser's and not this page's.
  // Called often (every frame, and from a timer); pulses already handed
  // over are never handed over again, and pulses missed while the page
  // could not run are skipped, not sent late in a burst.
  pump(now, bpm, anchor, send, ahead = 150) {
    if (!(bpm > 0)) return;
    const spacing = 60000 / (bpm * PPQ);
    // The next place on the app's own grid of pulses that is not too close
    // to the last one sent (after a tap or a change of tempo the grid has
    // moved: one pulse then comes a little early or late, never two at once).
    let n = Math.ceil((Math.max(this.last + spacing * 0.5, now) - anchor) / spacing);
    for (let at = anchor + n * spacing; at < now + ahead; n++, at = anchor + n * spacing) {
      if (this.wantStart && ((n % PPQ) + PPQ) % PPQ === 0) {
        // Just ahead of the pulse that is the beat: Start, then that pulse.
        send([START], at - 1);
        this.wantStart = false;
        this.started = true;
      }
      send([PULSE], at);
      this.last = at;
      this.pulses++;
    }
  }
}
