// Measures real glass-to-glass latency. With the phone pointed at the
// projected output, the output goes black, then flashes white; the probe
// times how long the flash takes to show up in the incoming video. That
// covers the projector, the camera, encoding, the network, decoding and
// rendering: the whole loop the audience sees.

const TRIALS = 5;
const DARK_MS = 600;
const TIMEOUT_MS = 1500;
const RISE = 0.12; // brightness jump (0..1) that counts as "the flash arrived"
// A flash this much later than the median is a stray (a camera hiccup, a
// frozen frame) and is reported on its own rather than stretching the range.
const STRAY_MS = 100;

export class LatencyProbe {
  constructor(sample) {
    this.sample = sample; // () => mean brightness of the input, 0..1, or null
    this.state = 'idle';
    this.message = '';
    this.results = [];
    this.ms = null;
  }

  start() {
    if (this.state === 'running') return;
    if (this.sample() === null) {
      this.state = 'failed';
      this.message = 'Select the phone or a camera as the input first.';
      return;
    }
    this.state = 'running';
    this.message = '';
    this.results = [];
    this.trial = 0;
    this.phase = 'dark';
    this.phaseAt = 0;
    this.baseline = 0;
  }

  // The engine is stopping mid-measurement.
  cancel() {
    if (this.state !== 'running') return;
    this.state = 'failed';
    this.message = 'The measurement was interrupted. Try again.';
  }

  // Called every frame. Returns what the output must show: 'black', 'white'
  // or null (normal picture). `frameMs` is the display's frame time.
  frame(now, frameMs) {
    if (this.state !== 'running') return null;
    this.lastNow = now;
    if (!this.phaseAt) this.phaseAt = now;
    const level = this.sample() ?? 0;

    if (this.phase === 'dark') {
      // Track the dark level; it also absorbs the previous flash decaying.
      this.baseline = level;
      if (now - this.phaseAt >= DARK_MS) {
        this.phase = 'flash';
        this.phaseAt = now;
        // The white frame reaches the screen about one frame after this.
        this.flashAt = now + frameMs;
      }
      return this.phase === 'flash' ? 'white' : 'black';
    }

    const seen = level - this.baseline > RISE;
    if (seen || now - this.phaseAt > TIMEOUT_MS) {
      if (seen) this.results.push(now - this.flashAt);
      this.trial++;
      this.phase = 'dark';
      this.phaseAt = now;
      if (this.trial >= TRIALS) this.finish();
      return 'black';
    }
    return 'white';
  }

  finish() {
    const r = [...this.results].sort((a, b) => a - b);
    if (r.length < 3) {
      this.state = 'failed';
      this.ms = null;
      this.message = `Only ${r.length} of ${TRIALS} flashes were seen. Point the phone at the output so it fills most of the frame, and dim other light.`;
      return;
    }
    this.state = 'done';
    this.ms = r[Math.floor(r.length / 2)];
    const kept = r.filter((ms) => Math.abs(ms - this.ms) <= STRAY_MS);
    const strays = r.filter((ms) => Math.abs(ms - this.ms) > STRAY_MS);
    const range = kept[0] === kept.at(-1) ? `${kept[0].toFixed(0)} ms each` : `${kept[0].toFixed(0)}–${kept.at(-1).toFixed(0)} ms`;
    this.message = `${r.length} of ${TRIALS} flashes seen, ${range}`;
    if (strays.length) this.message += `; ${strays.length === 1 ? 'one stray' : `${strays.length} strays`} at ${strays.map((ms) => ms.toFixed(0)).join(', ')} ms left out`;
  }

  status() {
    return { state: this.state, ms: this.ms, message: this.message, flashes: this.results.map((ms) => Math.round(ms)) };
  }
}
