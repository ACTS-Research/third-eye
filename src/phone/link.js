// Phone side of the link to the Mac. One watchdog tick repairs whatever is
// broken: signaling, the data connection, or the media call.

//
// Besides the PeerJS route there is a direct one whose handshake arrives by
// QR code or over a link that already exists (src/shared/direct.js). A
// direct link waits in `pendings` until the Mac's engine speaks on it, then
// takes the place of whatever link was in use.

import { Peer } from 'peerjs';
import { DirectCall, DirectConn, MAIN_CHANNEL, gathered, packAnswer, unpackOffer } from '../shared/direct.js';
import { hostPeerId, peerOptions } from '../shared/net.js';
import { SENSOR_CHANNEL } from '../shared/protocol.js';
import { DEFAULT_CODEC, preferCodec } from '../shared/sdp.js';

const TICK_MS = 1000;
const RETRY_MS = 2500;
const CONNECT_TIMEOUT_MS = 9000;
const MAX_PENDING = 4;

function pcState(connection) {
  return connection?.peerConnection?.connectionState ?? 'new';
}

export class HostLink {
  // directFirst: the page was opened from "Pair without internet". Normal
  // pairing is then held back until the direct link is up (or the operator
  // gives up on it), even if the pairing server happens to be reachable:
  // otherwise the phone would pair the usual way a moment before showing
  // its code, and never show it.
  constructor({ room, signal, onChange, onMessage, onDataOpen, directFirst = false }) {
    this.directFirst = directFirst;
    this.hostId = hostPeerId(room);
    this.signalUrl = signal;
    this.onChange = onChange;
    this.onMessage = onMessage;
    this.onDataOpen = onDataOpen;
    this.peer = null;
    this.conn = null;
    this.call = null;
    this.sensorChannel = null;
    this.codec = DEFAULT_CODEC;
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
    this.session = null; // which run of the Mac's engine the data link reaches
    this.callSession = null; // and which one the video call was made to
    this.pendings = new Map(); // direct links not yet in use, by handshake id
    this.introduced = new Set(); // offers already answered
    this.direct = false; // the link in use is a direct one
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
    // A direct link does not hang on the signaling peer.
    if (!this.direct) {
      this.conn = null;
      this.call = null;
    }
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
      if (err.type === 'peer-unavailable') this.error = 'Mac not found. Is the control page open on the Mac, and is the room code right?';
      else this.error = `Signaling: ${err.type ?? err}`;
      this.changed();
    });
  }

  // The Reconnect button: a fresh start for the signaling side and an
  // immediate redial. (A direct link that is still up is left alone.)
  restart() {
    this.makePeer();
    this.connTriedAt = -1e9;
    this.callTriedAt = -1e9;
    this.changed();
  }

  // Start (or stop, with null) sending a camera stream.
  setStream(stream, quality) {
    this.stream = stream;
    this.quality = quality ?? this.quality;
    if (!stream) {
      // (On a direct link detach() has already emptied the sender.)
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
    if (pcState(this.call) !== 'connected' && !this.direct) return null;
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

  // The Mac chooses the video codec; a change restarts the call with it.
  setCodec(codec) {
    if (!codec || codec === this.codec) return;
    this.codec = codec;
    // A direct link's codec was settled in its handshake.
    if (this.call && !this.direct) {
      this.dropCall();
      this.callTriedAt = -1e9;
      this.tick();
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
    // On a direct link the video shares the connection with the messages.
    if (call?.direct) return;
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
    if (conn?.direct) {
      this.call = null;
      this.direct = false;
      this.sensorChannel = null;
    }
    try {
      conn?.close();
    } catch {
      /* already closed */
    }
  }

  // The Mac says which run of its engine this is. The picture can move
  // between its control page and its output window; a video call made to the
  // one that stopped leads nowhere, and this end can take a long time to
  // notice by itself. Call again at once.
  onHostSession(session) {
    const stale = this.call && this.callSession && this.callSession !== session;
    this.session = session;
    if (stale) {
      this.dropCall();
      this.callTriedAt = -1e9;
      this.tick();
    } else if (this.call) {
      this.callSession = session;
    }
  }

  connectData() {
    this.connTriedAt = performance.now();
    this.session = null;
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
    conn.on('data', (msg) => this.onData(conn, msg));
    conn.on('close', () => {
      if (this.conn === conn) this.conn = null;
      this.changed();
    });
    conn.on('error', () => {});
  }

  onData(conn, msg) {
    if (conn !== this.conn || !msg) return;
    if (msg.t === 'pong') this.rttMs = performance.now() - msg.ts;
    else if (msg.t === 'config') this.setCodec(msg.codec);
    else if (msg.t === 'host') this.onHostSession(msg.session);
    else if (msg.t === 'intro') this.introduce(msg, (reply) => this.send(reply));
    else this.onMessage?.(msg);
  }

  // Another window of the Mac's browser wants its own link to this phone,
  // ahead of the picture moving there. Its offer came over a link we have;
  // the answer goes back the same way.
  introduce(msg, reply) {
    if (!msg.offer || this.introduced.has(msg.offer)) return;
    this.introduced.add(msg.offer);
    this.answerOffer(msg.offer)
      .then(({ token }) => reply({ t: 'intro-answer', to: msg.from, token }))
      .catch((err) => console.warn('[link] introduction failed', err));
  }

  // ------------------------------------------------------ direct links ---

  // Answers an offer from the Mac. Returns the short token the Mac needs
  // back. The link itself stays in reserve until the Mac's engine speaks on
  // it (its first message is always `host`).
  async answerOffer(packed) {
    const { id, sdp } = await unpackOffer(packed);
    const pc = new RTCPeerConnection({ iceServers: [] });
    const main = pc.createDataChannel(MAIN_CHANNEL.label, MAIN_CHANNEL.options);
    let sensor = null;
    try {
      sensor = pc.createDataChannel(SENSOR_CHANNEL.label, SENSOR_CHANNEL.options);
    } catch (err) {
      console.warn('[link] no sensor channel', err);
    }
    await pc.setRemoteDescription({ type: 'offer', sdp });
    // Always agree to send video, camera or not: the camera can then come
    // and go by swapping the track, with no second handshake.
    const video = pc.getTransceivers().find((t) => t.receiver.track?.kind === 'video');
    if (video) video.direction = 'sendonly';
    await pc.setLocalDescription(await pc.createAnswer());
    await gathered(pc);
    const p = { id, pc, main, sensor, video, madeAt: performance.now() };
    this.pendings.get(id)?.pc.close();
    this.pendings.set(id, p);
    main.onmessage = (e) => {
      let msg;
      try {
        msg = JSON.parse(e.data);
      } catch {
        return;
      }
      if (!this.pendings.has(id)) return;
      if (msg?.t === 'intro') {
        this.introduce(msg, (reply) => main.send(JSON.stringify(reply)));
      } else if (msg?.t === 'host') {
        this.promote(p);
        this.onData(this.conn, msg);
      }
    };
    // Keep only a few in reserve, the newest ones.
    while (this.pendings.size > MAX_PENDING) {
      const [oldest, stale] = this.pendings.entries().next().value;
      stale.pc.close();
      this.pendings.delete(oldest);
    }
    return { id, token: packAnswer(id, pc.localDescription.sdp) };
  }

  // Makes a waiting direct link the one in use.
  promote(p) {
    this.pendings.delete(p.id);
    this.dropCall();
    this.dropConn();
    const conn = new DirectConn(p.pc, p.main);
    conn.on('data', (msg) => this.onData(conn, msg));
    conn.on('close', () => {
      if (this.conn === conn) this.dropConn();
      this.changed();
    });
    this.conn = conn;
    this.call = new DirectCall(p.pc);
    this.sensorChannel = p.sensor;
    this.direct = true;
    this.directFirst = false;
    this.session = null;
    this.callSession = null;
    this.connBadSince = 0;
    this.callBadSince = 0;
    this.error = '';
    p.pc.addEventListener('connectionstatechange', () => this.changed());
    const track = this.stream?.getVideoTracks()[0];
    if (track && p.video) {
      p.video.sender
        .replaceTrack(track)
        .then(() => {
          this.send({ t: 'hold', on: false });
          return this.tuneSender();
        })
        .catch((err) => console.warn('[link] could not start video on the direct link', err));
    }
    this.onDataOpen?.(conn);
    this.changed();
  }

  callMedia() {
    this.callTriedAt = performance.now();
    this.dropCall();
    const call = this.peer.call(this.hostId, this.stream, { sdpTransform: (sdp) => preferCodec(sdp, this.codec) });
    if (!call) return;
    this.call = call;
    this.callSession = this.session;
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
    // A direct link cannot be rebuilt without a new handshake, so it is
    // given every chance to recover by itself.
    if (connection.direct) return false;
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
    let peer = this.peer;
    if (!peer || peer.destroyed) {
      if (now - this.madeAt > RETRY_MS) this.makePeer();
      peer = null;
    } else if (peer.disconnected && now - this.lastReconnectAt > RETRY_MS) {
      this.lastReconnectAt = now;
      try {
        peer.reconnect();
      } catch {
        /* retried next tick */
      }
    }

    if (this.conn && this.isBad(this.conn, this.connTriedAt, 'connBadSince', now)) this.dropConn();
    if (this.call && this.isBad(this.call, this.callTriedAt, 'callBadSince', now)) this.dropCall();
    for (const [id, p] of this.pendings) {
      if (['failed', 'closed'].includes(p.pc.connectionState)) {
        p.pc.close();
        this.pendings.delete(id);
      }
    }

    if (peer?.open && !this.directFirst) {
      if (!this.conn && now - this.connTriedAt > RETRY_MS) this.connectData();
      if (this.stream && !this.call && this.conn?.open && now - this.callTriedAt > RETRY_MS) this.callMedia();
    }
    this.send({ t: 'ping', ts: now });
    this.changed();
  }

  get state() {
    const data = this.conn?.open ? 'open' : this.conn ? 'connecting' : 'closed';
    const media = this.call ? pcState(this.call) : 'idle';
    return { signal: this.signal, data, media, error: this.error, rttMs: this.rttMs, direct: this.direct };
  }

  changed() {
    this.onChange?.(this.state);
  }
}
