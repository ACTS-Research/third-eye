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

// One picture taken from the feeds: its own texture, uploaded only when the
// feed it is showing has a new frame.
class Slot {
  constructor(feeds, kind) {
    this.feeds = feeds;
    this.kind = kind;
    this.force = false;
    this.tex = null;
    this.width = 0;
    this.height = 0;
    this.hasFrame = false;
    // Quarter turns (anticlockwise) applied to each phone's frames, asked
    // for with that phone's Rotate button. The engine sets them; every slot
    // of a manager shares the one object.
    this.turns = { phone: 0, phone2: 0 };
  }

  get quarter() {
    return this.turns[this.kind] ?? 0;
  }

  // The first phone's turn, as it was before there were two.
  get turn() {
    return this.turns.phone;
  }

  // The picture's size as shown, after any turn.
  size() {
    return this.quarter % 2 ? [this.height, this.width] : [this.width, this.height];
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

// Input A is the manager itself (what the chain starts from, and what vision
// watches); `b` is the second input, mixed in by the Mix B effect, with
// kind '' while it is off. The two never show the same feed: a feed's
// "new frame" flag is taken by whichever slot uploads it.
export class InputManager extends Slot {
  constructor() {
    super({ phone: new VideoFeed(), phone2: new VideoFeed(), camera: new VideoFeed(), file: new VideoFeed() }, 'pattern');
    this.b = new Slot(this.feeds, '');
    this.b.turns = this.turns;
    // A third picture, for the perform screen's rollover: a source neither A
    // nor B is showing, looked at without being chosen.
    this.peek = new Slot(this.feeds, '');
    this.peek.turns = this.turns;
    // And a fourth: the stand-by source shown while input A's has dropped.
    this.standby = new Slot(this.feeds, '');
    this.standby.turns = this.turns;
  }

  initGL(gl) {
    super.initGL(gl);
    this.b.initGL(gl);
    this.peek.initGL(gl);
    this.standby.initGL(gl);
  }

  // Both at once, so that when A and B change places neither is for a
  // moment showing the other's feed.
  setKinds(kind, kindB) {
    this.setKind(kind);
    this.b.setKind(kindB === kind ? '' : kindB || '');
  }
}
