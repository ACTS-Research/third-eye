// Records the engine's canvas (and the audio input, when that is on) to a file
// in the browser's private storage. /control lists the files and saves them
// to disk. Capturing costs nothing while not recording.

const TIMESLICE_MS = 1000;

function pickType(format) {
  const order = format === 'webm' ? ['video/webm', 'video/mp4'] : ['video/mp4', 'video/webm'];
  return order.find((t) => MediaRecorder.isTypeSupported(t)) ?? '';
}

function stamp() {
  const d = new Date();
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}-${p(d.getHours())}${p(d.getMinutes())}-${p(d.getSeconds())}`;
}

export class Recorder {
  constructor(canvas, getAudioStream) {
    this.canvas = canvas;
    this.getAudioStream = getAudioStream;
    this.recorder = null;
    this.worker = null;
    this.active = false;
    this.name = '';
    this.bytes = 0;
    this.startedAt = 0;
    this.error = '';
    this.finished = 0; // counts completed files so /control knows to refresh
    this.chain = Promise.resolve();
  }

  toggle(format) {
    if (this.active) this.stop();
    else this.start(format);
  }

  start(format) {
    if (this.active) return;
    this.error = '';
    const type = typeof MediaRecorder === 'undefined' ? '' : pickType(format);
    if (!type) {
      this.error = 'This browser cannot record video.';
      return;
    }
    try {
      const stream = this.canvas.captureStream();
      const audio = this.getAudioStream?.()?.getAudioTracks()[0];
      if (audio) stream.addTrack(audio.clone());
      const pixels = this.canvas.width * this.canvas.height;
      const recorder = new MediaRecorder(stream, {
        mimeType: type,
        videoBitsPerSecond: Math.min(40e6, Math.max(6e6, pixels * 6)),
      });
      this.name = `third-eye-${stamp()}.${type.includes('mp4') ? 'mp4' : 'webm'}`;
      this.bytes = 0;
      this.worker = new Worker(new URL('./recorder.worker.js', import.meta.url), { type: 'module' });
      this.worker.onmessage = (e) => this.onWorker(e.data);
      this.worker.onerror = (e) => this.fail(e.message || 'could not write the recording');
      this.worker.postMessage({ t: 'open', name: this.name });

      // Chunks must reach the file in order even though reading them is async.
      recorder.ondataavailable = (e) => {
        if (!e.data.size) return;
        this.chain = this.chain.then(async () => {
          const data = await e.data.arrayBuffer();
          this.worker?.postMessage({ t: 'chunk', data }, [data]);
        });
      };
      recorder.onerror = (e) => this.fail(e.error?.message || 'recorder error');
      recorder.onstop = () => {
        for (const track of stream.getTracks()) track.stop();
        this.chain = this.chain.then(() => this.worker?.postMessage({ t: 'close' }));
      };
      recorder.start(TIMESLICE_MS);
      this.recorder = recorder;
      this.active = true;
      this.startedAt = performance.now();
    } catch (err) {
      this.fail(err.message || String(err));
    }
  }

  stop() {
    if (!this.active) return;
    this.active = false;
    try {
      this.recorder?.stop();
    } catch {
      /* already stopped */
    }
    this.recorder = null;
  }

  onWorker(msg) {
    if (msg.t === 'progress') this.bytes = msg.bytes;
    else if (msg.t === 'error') this.fail(msg.message);
    else if (msg.t === 'closed') {
      this.bytes = msg.bytes;
      this.finished++;
      this.worker?.terminate();
      this.worker = null;
    }
  }

  fail(message) {
    this.error = `Recording stopped: ${message}`;
    this.stop();
  }

  status() {
    return {
      active: this.active,
      name: this.name,
      seconds: this.active ? (performance.now() - this.startedAt) / 1000 : 0,
      bytes: this.bytes,
      finished: this.finished,
      error: this.error,
    };
  }
}
