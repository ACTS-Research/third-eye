// Microphone / line-in analysis: overall level, three bands and a beat pulse,
// published as modulation sources. Nothing is ever played back.

import { clamp } from '../shared/util.js';

const FFT_SIZE = 2048;
const BANDS = [
  ['audio.bass', 30, 180],
  ['audio.mid', 180, 2200],
  ['audio.high', 2200, 11000],
];
const BEAT_DECAY_S = 0.18;
const BEAT_MIN_GAP_MS = 180;
const FLUX_HISTORY = 48; // about 0.8 s at 60 fps

export class AudioInput {
  constructor(mod) {
    this.mod = mod;
    this.ctx = null;
    this.stream = null;
    this.analyser = null;
    this.state = 'off';
    this.error = '';
    this.label = '';
    this.deviceId = null;
    this.starting = false;
    this.beat = 0;
    this.lastBeatAt = 0;
    this.envelopes = new Map();
    this.flux = [];
    this.bpmTaps = [];

    // An AudioContext created before the user has ever touched this window
    // starts suspended; the first click or key press wakes it.
    const wake = () => {
      if (this.ctx?.state === 'suspended') this.ctx.resume().catch(() => {});
    };
    window.addEventListener('pointerdown', wake);
    window.addEventListener('keydown', wake);
  }

  async enable(deviceId) {
    if (this.starting) return;
    if (this.stream && this.deviceId === deviceId && this.stream.getAudioTracks()[0]?.readyState === 'live') return;
    this.starting = true;
    this.disable();
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: false,
        audio: {
          deviceId: deviceId ? { exact: deviceId } : undefined,
          // Raw signal: voice processing would flatten the dynamics.
          echoCancellation: false,
          noiseSuppression: false,
          autoGainControl: false,
        },
      });
      this.stream = stream;
      this.deviceId = deviceId;
      this.label = stream.getAudioTracks()[0].label;
      stream.getAudioTracks()[0].addEventListener('ended', () => {
        if (this.stream === stream) this.state = 'lost';
      });
      this.ctx = new AudioContext({ latencyHint: 'interactive' });
      this.analyser = this.ctx.createAnalyser();
      this.analyser.fftSize = FFT_SIZE;
      this.analyser.smoothingTimeConstant = 0;
      this.ctx.createMediaStreamSource(stream).connect(this.analyser);
      this.freq = new Uint8Array(this.analyser.frequencyBinCount);
      this.prev = new Float32Array(this.analyser.frequencyBinCount);
      this.wave = new Float32Array(FFT_SIZE);
      this.flux = [];
      this.state = 'live';
      this.error = '';
      this.ctx.resume().catch(() => {});
    } catch (err) {
      this.state = 'error';
      this.error = err.name === 'NotAllowedError' ? 'Microphone permission needed — enable audio on the control page' : `${err.name}: ${err.message}`;
    } finally {
      this.starting = false;
    }
  }

  disable() {
    for (const track of this.stream?.getTracks() ?? []) track.stop();
    this.ctx?.close().catch(() => {});
    this.stream = null;
    this.ctx = null;
    this.analyser = null;
    this.state = 'off';
    this.beat = 0;
    for (const id of ['audio.level', 'audio.beat', ...BANDS.map((b) => b[0])]) this.mod.set(id, 0);
  }

  // Fast attack, slower release: reacts to hits without flickering.
  follow(id, target, dt) {
    const prev = this.envelopes.get(id) ?? 0;
    const tau = target > prev ? 0.015 : 0.14;
    const next = prev + (target - prev) * (1 - Math.exp(-dt / tau));
    this.envelopes.set(id, next);
    this.mod.set(id, clamp(next, 0, 1));
  }

  // Called once per rendered frame.
  frame(dt, now, settings) {
    if (!this.analyser || this.ctx.state !== 'running') return;
    const { analyser, freq, prev, wave, mod } = this;
    const gain = settings.gain;
    const hzPerBin = this.ctx.sampleRate / FFT_SIZE;

    analyser.getFloatTimeDomainData(wave);
    let sum = 0;
    for (let i = 0; i < wave.length; i++) sum += wave[i] * wave[i];
    this.follow('audio.level', Math.sqrt(sum / wave.length) * 4 * gain, dt);

    analyser.getByteFrequencyData(freq);
    for (const [id, lo, hi] of BANDS) {
      const a = Math.max(1, Math.floor(lo / hzPerBin));
      const b = Math.min(freq.length - 1, Math.ceil(hi / hzPerBin));
      let total = 0;
      for (let i = a; i <= b; i++) total += freq[i];
      this.follow(id, (total / (b - a + 1) / 255) * 1.6 * gain, dt);
    }

    // Beat: spectral flux (energy that just appeared), weighted towards the
    // low end, compared with its own recent average.
    const lowEnd = Math.ceil(200 / hzPerBin);
    const top = Math.min(freq.length, Math.ceil(8000 / hzPerBin));
    let flux = 0;
    for (let i = 1; i < top; i++) {
      const v = freq[i] / 255;
      const rise = v - prev[i];
      if (rise > 0) flux += rise * (i <= lowEnd ? 1 : 0.25);
      prev[i] = v;
    }
    flux /= lowEnd;
    const history = this.flux;
    const mean = history.length ? history.reduce((x, y) => x + y, 0) / history.length : 0;
    history.push(flux);
    if (history.length > FLUX_HISTORY) history.shift();
    if (history.length > 8 && flux > mean * settings.sensitivity + 0.02 / gain && now - this.lastBeatAt > BEAT_MIN_GAP_MS) {
      this.beat = 1;
      this.lastBeatAt = now;
      this.beats = (this.beats ?? 0) + 1;
    } else {
      this.beat *= Math.exp(-dt / BEAT_DECAY_S);
    }
    mod.set('audio.beat', this.beat);
  }

  status() {
    let state = this.state;
    if (state === 'live' && this.ctx?.state !== 'running') state = 'suspended';
    return { state, error: this.error, label: this.label, beats: this.beats ?? 0 };
  }
}
