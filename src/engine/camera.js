// Local camera input (built-in, USB, or an iPhone through Continuity Camera).
// Permission is requested from /control so no prompt ever appears on the
// projector; /output just opens the device that was picked there.

export class LocalCamera {
  constructor(feed) {
    this.feed = feed;
    this.stream = null;
    this.deviceId = null;
    this.state = 'off';
    this.error = '';
    this.label = '';
    this.starting = false;
    this.lastTryAt = 0;
  }

  get live() {
    return this.stream?.getVideoTracks()[0]?.readyState === 'live';
  }

  // Called about once a second while the camera is the selected input (and
  // afterwards, to keep it warm for instant switching).
  ensure(deviceId) {
    if (this.starting) return;
    if (this.live && this.deviceId === deviceId) return;
    const now = performance.now();
    if (now - this.lastTryAt < 2000) return;
    this.lastTryAt = now;
    this.start(deviceId);
  }

  async start(deviceId) {
    this.starting = true;
    this.stop(false);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: false,
        video: {
          deviceId: deviceId ? { exact: deviceId } : undefined,
          width: { ideal: 1920 },
          height: { ideal: 1080 },
          frameRate: { ideal: 60 },
        },
      });
      this.stream = stream;
      this.deviceId = deviceId;
      const track = stream.getVideoTracks()[0];
      this.label = track.label;
      track.addEventListener('ended', () => {
        if (this.stream === stream) this.state = 'lost';
      });
      this.feed.setStream(stream);
      this.state = 'live';
      this.error = '';
    } catch (err) {
      this.state = 'error';
      this.error = err.name === 'NotAllowedError' ? 'Camera permission needed — click "Find cameras" on the control page' : `${err.name}: ${err.message}`;
    } finally {
      this.starting = false;
    }
  }

  stop(clear = true) {
    for (const track of this.stream?.getTracks() ?? []) track.stop();
    this.stream = null;
    if (clear) {
      this.state = 'off';
      this.deviceId = null;
    }
  }

  status() {
    return { state: this.live ? 'live' : this.state, error: this.error, label: this.label };
  }
}
