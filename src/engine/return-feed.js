// The finished picture, small, as a video stream for the phone: with its
// preview set to "Mac output" the performer sees the effects, Freeze and
// Blackout on the phone instead of the raw camera.
//
// It rides on the video call the phone already makes (the Mac answers with
// this stream), so nothing new is negotiated. Nothing is drawn, and so
// nothing is sent, unless a phone has asked for it.

const WIDTH = 480;
const INTERVAL_MS = 62; // about 15 pictures a second
export const RETURN_KBPS = 500;

export class ReturnFeed {
  // source: the canvas the engine draws on.
  constructor(source) {
    this.source = source;
    this.canvas = document.createElement('canvas');
    this.canvas.width = WIDTH;
    this.canvas.height = Math.round((WIDTH * 9) / 16);
    this.ctx = this.canvas.getContext('2d', { alpha: false });
    this.on = false;
    this.drawnAt = 0;
    this.made = null;
  }

  // Made the first time a phone calls. A canvas stream carries a new picture
  // only when the canvas is drawn on.
  get stream() {
    try {
      this.made ??= this.canvas.captureStream();
    } catch (err) {
      console.warn('[return] no stream', err);
    }
    return this.made;
  }

  // Called straight after the engine has drawn a frame, while that frame can
  // still be read from its canvas.
  frame(now) {
    if (!this.on || !this.made || now - this.drawnAt < INTERVAL_MS) return;
    this.drawnAt = now;
    const { source, canvas } = this;
    if (!source.width || !source.height) return;
    // Same shape as the picture, an even number of lines.
    const height = Math.max(2, Math.round((WIDTH * source.height) / source.width / 2) * 2);
    if (canvas.height !== height) canvas.height = height;
    this.ctx.drawImage(source, 0, 0, canvas.width, canvas.height);
  }
}
