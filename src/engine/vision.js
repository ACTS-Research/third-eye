// Main-thread side of the vision worker: feeds it downscaled frames, turns
// results into modulation sources and keeps the person mask texture fresh.


const FRAME_WIDTH = 480; // inference input; models resize further themselves
const MIN_INTERVAL_MS = 33; // at most ~30 inference passes per second
const BUSY_TIMEOUT_MS = 6000;
const MASK_FRESH_MS = 1500;
export const VISION_FEATURES = ['face', 'hands', 'gesture', 'pose', 'segment'];
const SOURCE_PREFIX = { face: 'face.', hands: 'hand.', gesture: 'gesture.', pose: 'pose.', segment: 'seg.' };

export class Vision {
  constructor(mod) {
    this.mod = mod;
    this.worker = null;
    this.key = '';
    this.busy = false;
    this.sentAt = 0;
    this.features = {};
    this.enabled = false;
    this.segmenting = false;
    this.ms = 0;
    this.passes = 0;
    this.hz = 0;
    this.error = '';
    this.gl = null;
    this.tex = null;
    this.pendingMask = null;
    this.maskAt = -1e9;
  }

  initGL(gl) {
    this.gl = gl;
    this.tex = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, this.tex);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    this.maskAt = -1e9;
  }

  // settings: { face, hands, gesture, pose, segment, delegate }
  configure(settings) {
    const key = JSON.stringify(settings);
    if (key === this.key) return;
    this.key = key;
    const features = Object.fromEntries(VISION_FEATURES.map((f) => [f, !!settings[f]]));
    // A feature that is switched off must not leave its last reading behind
    // (a "thumb up" stuck at 0.8 would hold a trigger open for ever).
    for (const name of VISION_FEATURES) {
      if (features[name]) continue;
      for (const id of this.mod.values.keys()) {
        if (id.startsWith(SOURCE_PREFIX[name])) this.mod.set(id, 0);
      }
    }
    this.enabled = Object.values(features).some(Boolean);
    this.segmenting = features.segment;
    if (!this.enabled) {
      // Nothing wanted: free the models and the worker entirely.
      this.worker?.terminate();
      this.worker = null;
      this.busy = false;
      this.features = {};
      this.maskAt = -1e9;
      return;
    }
    if (!this.worker) {
      this.worker = new Worker(new URL('./vision.worker.js', import.meta.url), { type: 'module' });
      this.worker.onmessage = (e) => this.onMessage(e.data);
      this.worker.onerror = (e) => {
        this.error = e.message || 'vision worker failed to start';
        this.busy = false;
      };
    }
    if (!features.segment) this.maskAt = -1e9;
    this.worker.postMessage({
      t: 'config',
      features,
      delegate: settings.delegate === 'CPU' ? 'CPU' : 'GPU',
      root: new URL('../', location.href).href,
    });
  }

  onMessage(msg) {
    if (msg.t === 'status') {
      this.features = msg.features;
      return;
    }
    if (msg.t !== 'result') return;
    this.busy = false;
    this.ms = this.ms ? this.ms * 0.8 + msg.ms * 0.2 : msg.ms;
    this.passes++;
    this.error = msg.error;
    for (const id in msg.values) this.mod.set(id, msg.values[id]);
    if (msg.mask) this.pendingMask = msg.mask;
  }

  // Called every rendered frame with the active input's <video> (or null)
  // and the quarter turns (anticlockwise) the picture is shown with, so the
  // models see faces and hands the same way up as the audience does.
  frame(now, video, quarter = 0) {
    if (!this.worker || !this.enabled) return;
    if (this.busy && now - this.sentAt > BUSY_TIMEOUT_MS) this.busy = false;
    if (this.busy || now - this.sentAt < MIN_INTERVAL_MS) return;
    if (!video || video.readyState < 2 || !video.videoWidth) return;
    if (!Object.values(this.features).some((f) => f.state === 'ready')) return;
    this.busy = true;
    this.sentAt = now;
    const width = Math.min(FRAME_WIDTH, video.videoWidth);
    const height = Math.max(1, Math.round((width * video.videoHeight) / video.videoWidth));
    let grab;
    if (quarter) {
      const odd = quarter % 2 === 1;
      this.turner ??= new OffscreenCanvas(1, 1);
      this.turner.width = odd ? height : width;
      this.turner.height = odd ? width : height;
      const ctx = this.turner.getContext('2d');
      ctx.translate(this.turner.width / 2, this.turner.height / 2);
      ctx.rotate((-quarter * Math.PI) / 2);
      ctx.drawImage(video, -width / 2, -height / 2, width, height);
      grab = createImageBitmap(this.turner);
    } else {
      grab = createImageBitmap(video, { resizeWidth: width, resizeHeight: height, resizeQuality: 'low' });
    }
    grab
      .then((bitmap) => {
        if (this.worker) this.worker.postMessage({ t: 'frame', bitmap }, [bitmap]);
        else bitmap.close();
      })
      .catch(() => {
        this.busy = false;
      });
  }

  // Uploads a newly arrived mask and returns the texture, or null when no
  // fresh mask exists (segmentation off, or the input has no video).
  maskTexture(now) {
    const gl = this.gl;
    if (this.pendingMask && gl) {
      const { width, height, data } = this.pendingMask;
      this.pendingMask = null;
      gl.bindTexture(gl.TEXTURE_2D, this.tex);
      gl.pixelStorei(gl.UNPACK_ALIGNMENT, 1);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.R8, width, height, 0, gl.RED, gl.UNSIGNED_BYTE, data);
      gl.pixelStorei(gl.UNPACK_ALIGNMENT, 4);
      this.maskAt = now;
    }
    return this.segmenting && now - this.maskAt < MASK_FRESH_MS ? this.tex : null;
  }

  takeRate(dt) {
    this.hz = this.passes / dt;
    this.passes = 0;
  }

  status() {
    return {
      enabled: this.enabled,
      features: this.features,
      ms: this.ms,
      hz: this.hz,
      error: this.error,
      mask: this.segmenting && performance.now() - this.maskAt < MASK_FRESH_MS,
    };
  }
}

