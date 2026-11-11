// Video inputs. Every live source is a <video> element; a frame is uploaded
// to one shared texture only when the element reports a new one. When a
// source stalls nothing is uploaded, so the last frame is held automatically.

import { createTexture } from './gl.js';

export class VideoFeed {
  constructor() {
    const v = document.createElement('video');
    v.muted = true;
    v.playsInline = true;
    v.autoplay = true;
    v.disablePictureInPicture = true;
    this.video = v;
    this.fresh = false;
    this.frames = 0;
    this.lastFrameAt = 0;
    this.active = false;
    // When true, new frames are ignored and the last uploaded one is held.
    this.gated = false;
    // Capture (or receive) -> display delay, accumulated between status reads.
    this.delaySum = 0;
    this.delayCount = 0;
    this.delayFromCapture = false;

    const onFrame = (_now, meta) => {
      this.fresh = true;
      this.frames++;
      this.lastFrameAt = performance.now();
      const from = meta.captureTime ?? meta.receiveTime;
      if (from && meta.expectedDisplayTime) {
        this.delaySum += meta.expectedDisplayTime - from;
        this.delayCount++;
        this.delayFromCapture = meta.captureTime !== undefined;
      }
      v.requestVideoFrameCallback(onFrame);
    };
    v.requestVideoFrameCallback(onFrame);
  }

  setStream(stream) {
    this.revoke();
    this.video.loop = false;
    this.video.srcObject = stream;
    this.active = !!stream;
    if (stream) this.video.play().catch(() => {});
  }

  setBlob(blob) {
    this.revoke();
    this.video.srcObject = null;
    this.url = URL.createObjectURL(blob);
    this.video.loop = true;
    this.video.src = this.url;
    this.active = true;
    this.video.play().catch(() => {});
  }

  clear() {
    this.revoke();
    this.video.srcObject = null;
    this.video.removeAttribute('src');
    this.video.load();
    this.active = false;
  }

  revoke() {
    if (this.url) URL.revokeObjectURL(this.url);
    this.url = null;
  }

  get ready() {
    return this.video.readyState >= 2 && this.video.videoWidth > 0;
  }

  // Average delay since the last call, or null when no frames arrived.
  takeDelay() {
    if (!this.delayCount) return null;
    const ms = this.delaySum / this.delayCount;
    this.delaySum = 0;
    this.delayCount = 0;
    return { ms, fromCapture: this.delayFromCapture };
  }
}

export class InputManager {
  constructor() {
    this.feeds = { phone: new VideoFeed(), camera: new VideoFeed(), file: new VideoFeed() };
    this.kind = 'pattern';
    this.force = false;
    this.tex = null;
    this.width = 0;
    this.height = 0;
    this.hasFrame = false;
  }

  initGL(gl) {
    this.gl = gl;
    this.tex = createTexture(gl);
    this.hasFrame = false;
    this.force = true;
  }

  setKind(kind) {
    if (kind === this.kind) return;
    this.kind = kind;
    this.force = true;
  }

  get feed() {
    return this.feeds[this.kind] ?? null;
  }

  // Uploads the newest frame of the active feed. Returns true when the
  // texture changed.
  update() {
    const feed = this.feed;
    if (!feed || !feed.ready || feed.gated) return false;
    if (!feed.fresh && !this.force) return false;
    const gl = this.gl;
    const v = feed.video;
    gl.bindTexture(gl.TEXTURE_2D, this.tex);
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true);
    try {
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, v);
    } catch (err) {
      gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false);
      return false;
    }
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false);
    this.width = v.videoWidth;
    this.height = v.videoHeight;
    this.hasFrame = true;
    feed.fresh = false;
    this.force = false;
    return true;
  }
}
