// Phone side of the link to the Mac. One watchdog tick repairs whatever is
// broken: signaling, the data connection, or the media call.

import { Peer } from 'peerjs';
import { hostPeerId, peerOptions } from '../shared/net.js';
import { SENSOR_CHANNEL } from '../shared/protocol.js';

const TICK_MS = 1000;
const RETRY_MS = 2500;
const CONNECT_TIMEOUT_MS = 9000;

function pcState(connection) {
  return connection?.peerConnection?.connectionState ?? 'new';
}

export class HostLink {
  constructor({ room, signal, onChange, onMessage, onDataOpen }) {
    this.hostId = hostPeerId(room);
    this.signalUrl = signal;
    this.onChange = onChange;
    this.onMessage = onMessage;
    this.onDataOpen = onDataOpen;
    this.peer = null;
    this.conn = null;
    this.call = null;
    this.sensorChannel = null;
    this.stream = null;
    this.quality = null;
    this.signal = 'connecting';
    this.error = '';
    this.rttMs = null;
    this.madeAt = 0;
    this.lastReconnectAt = 0;
    this.connTriedAt = -1e9;
    this.callTriedAt = -1e9;
    this.callBadSince = 0;
    this.connBadSince = 0;
    this.timer = 0;
  }

  start() {
    if (this.timer) return;
    this.makePeer();
    this.timer = setInterval(() => this.tick(), TICK_MS);
  }

  makePeer() {
    try {
      this.peer?.destroy();
    } catch {
      /* already gone */
    }
    this.conn = null;
    this.call = null;
    this.madeAt = performance.now();
    this.signal = 'connecting';
    const peer = new Peer(peerOptions(this.signalUrl));
    this.peer = peer;
    peer.on('open', () => {
      if (peer !== this.peer) return;
      this.signal = 'open';
      this.error = '';
      this.tick();
    });
    peer.on('disconnected', () => {
      if (peer === this.peer) this.signal = 'lost';
      this.changed();
    });
    peer.on('error', (err) => {
      if (peer !== this.peer) return;
      if (err.type === 'peer-unavailable') this.error = 'Mac not found. Is the output window open, and is the room code right?';
      else this.error = `Signaling: ${err.type ?? err}`;
      this.changed();
    });
  }

  // Start (or stop, with null) sending a camera stream.
  setStream(stream, quality) {
    this.stream = stream;
    this.quality = quality ?? this.quality;
    if (!stream) {
      this.dropCall();
      this.changed();
      return;
    }
    const sender = this.videoSender();
    if (sender) {
      // Same call, new track: no renegotiation, the Mac just sees new frames.
      sender
        .replaceTrack(stream.getVideoTracks()[0])
        .then(() => {
          this.send({ t: 'hold', on: false });
          return this.tuneSender();
        })
        .catch(() => this.dropCall());
    } else {
      this.callTriedAt = -1e9;
      this.tick();
    }
  }

  videoSender() {
    if (pcState(this.call) !== 'connected') return null;
    return this.call.peerConnection.getSenders().find((s) => s.track?.kind === 'video' || s.track === null) ?? null;
  }

  // Must run before a camera track is stopped. A sender whose track has ended
  // transmits black frames; with no track it transmits nothing, so the Mac
  // simply keeps showing the last good frame.
  async detach() {
    this.send({ t: 'hold', on: true });
    const sender = this.videoSender();
    if (!sender?.track) return;
    try {
      await sender.replaceTrack(null);
    } catch {
      /* the call is going away anyway */
    }
  }

  async tuneSender() {
    const sender = this.call?.peerConnection?.getSenders().find((s) => s.track?.kind === 'video');
    if (!sender || !this.quality) return;
    try {
      sender.track.contentHint = 'motion';
      const params = sender.getParameters();
      if (!params.encodings?.length) params.encodings = [{}];
      params.encodings[0].maxBitrate = this.quality.kbps * 1000;
      params.encodings[0].maxFramerate = this.quality.fps;
      // Under pressure drop resolution, not frames: motion stays fluid.
      params.degradationPreference = 'maintain-framerate';
      await sender.setParameters(params);
    } catch (err) {
      console.warn('[link] could not tune sender', err);
    }
  }

  send(msg) {
    if (this.conn?.open) {
      try {
        this.conn.send(msg);
      } catch {
        /* dropped; the watchdog reconnects */
      }
    }
  }

  sendSensors(packet) {
    const ch = this.sensorChannel;
    // Skip rather than queue when the channel is backed up.
    if (ch?.readyState === 'open' && ch.bufferedAmount < 1024) {
      try {
        ch.send(packet);
      } catch {
        /* channel closing */
      }
    }
  }

  dropCall() {
    const call = this.call;
    this.call = null;
    try {
      call?.close();
    } catch {
      /* already closed */
    }
  }

  dropConn() {
    const conn = this.conn;
    this.conn = null;
    try {
      conn?.close();
    } catch {
      /* already closed */
    }
  }

  connectData() {
    this.connTriedAt = performance.now();
    const conn = this.peer.connect(this.hostId, { reliable: true, serialization: 'json' });
    this.conn = conn;
    // Second channel on the same connection for sensor data: unordered and
    // never retransmitted, so a late sample cannot delay a fresh one.
    try {
      this.sensorChannel = conn.peerConnection.createDataChannel(SENSOR_CHANNEL.label, SENSOR_CHANNEL.options);
    } catch (err) {
      this.sensorChannel = null;
      console.warn('[link] no sensor channel', err);
    }
    conn.on('open', () => {
      if (conn !== this.conn) return;
      this.error = '';
      this.onDataOpen?.(conn);
      this.changed();
      this.tick();
    });
    conn.on('data', (msg) => {
      if (conn !== this.conn || !msg) return;
      if (msg.t === 'pong') this.rttMs = performance.now() - msg.ts;
      else this.onMessage?.(msg);
    });
    conn.on('close', () => {
      if (this.conn === conn) this.conn = null;
      this.changed();
    });
    conn.on('error', () => {});
  }

  callMedia() {
    this.callTriedAt = performance.now();
    this.dropCall();
    const call = this.peer.call(this.hostId, this.stream);
    if (!call) return;
    this.call = call;
    const pc = call.peerConnection;
    pc?.addEventListener('connectionstatechange', () => {
      if (call !== this.call) return;
      if (pc.connectionState === 'connected') {
        this.send({ t: 'hold', on: false });
        this.tuneSender();
      }
      this.changed();
    });
    call.on('close', () => {
      if (this.call === call) this.call = null;
      this.changed();
    });
    call.on('error', () => {});
  }

  // A connection is bad when it failed, closed, hung while connecting, or
  // has been "disconnected" for a few seconds.
  isBad(connection, triedAt, sinceKey, now) {
    const state = pcState(connection);
    if (state === 'failed' || state === 'closed') return true;
    if (state === 'connected') {
      this[sinceKey] = 0;
      return false;
    }
    if (state === 'disconnected') {
      this[sinceKey] ||= now;
      return now - this[sinceKey] > 4000;
    }
    return now - triedAt > CONNECT_TIMEOUT_MS;
  }

  tick() {
    const now = performance.now();
    const peer = this.peer;
    if (!peer || peer.destroyed) {
      if (now - this.madeAt > RETRY_MS) this.makePeer();
      this.changed();
      return;
    }
    if (peer.disconnected && now - this.lastReconnectAt > RETRY_MS) {
      this.lastReconnectAt = now;
      try {
        peer.reconnect();
      } catch {
        /* retried next tick */
      }
    }

    if (this.conn && this.isBad(this.conn, this.connTriedAt, 'connBadSince', now)) this.dropConn();
    if (this.call && this.isBad(this.call, this.callTriedAt, 'callBadSince', now)) this.dropCall();

    if (peer.open) {
      if (!this.conn && now - this.connTriedAt > RETRY_MS) this.connectData();
      if (this.stream && !this.call && this.conn?.open && now - this.callTriedAt > RETRY_MS) this.callMedia();
    }
    this.send({ t: 'ping', ts: now });
    this.changed();
  }

  get state() {
    const data = this.conn?.open ? 'open' : this.conn ? 'connecting' : 'closed';
    const media = this.call ? pcState(this.call) : 'idle';
    return { signal: this.signal, data, media, error: this.error, rttMs: this.rttMs };
  }

  changed() {
    this.onChange?.(this.state);
  }
}
