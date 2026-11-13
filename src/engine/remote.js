// Host side of the phone link. The page hosting the engine registers with the
// signaling server under an id derived from the room code and waits. The phone calls in with
// its camera (a PeerJS media connection) and opens a data connection.
//
// A watchdog owns all recovery: whatever breaks, the next tick repairs it.
// Existing peer-to-peer connections are never torn down just because the
// signaling server went away.

//
// There is a second way in that needs no signaling server: a direct link,
// whose handshake travels by QR code (makeOffer / acceptAnswer; see
// src/shared/direct.js) or, between two windows of this browser, over a link
// that already exists (an introduction). A direct link fills the same two
// slots, `conn` and `call`, as a PeerJS one, so everything else is unaware.

import { Peer } from 'peerjs';
import { DirectCall, DirectConn, MAIN_CHANNEL, buildAnswer, packOffer, randomId, restrictCodecs, slimOffer, unpackAnswer } from '../shared/direct.js';
import { hostPeerId, peerOptions } from '../shared/net.js';
import { preferCodec } from '../shared/sdp.js';

const TICK_MS = 1000;
const PHONE_TIMEOUT_MS = 4000;
const CONNECT_TIMEOUT_MS = 15000;
// How long after a start "room code taken" is put down to the window that
// just handed over, and simply tried again.
const HANDOVER_MS = 4000;

export class PhoneLink {
  constructor(feed, getNet, onMessage) {
    this.feed = feed;
    this.getNet = getNet;
    this.onMessage = onMessage;
    this.peer = null;
    this.call = null;
    this.conn = null;
    this.signal = 'connecting';
    this.error = '';
    this.openedAt = 0;
    this.lastReconnectAt = 0;
    this.lastHeardAt = 0;
    this.phoneInfo = null;
    // True while the phone is deliberately not sending (camera restart, page
    // hidden): frames that still trickle in are ignored so the last good
    // one stays up.
    this.hold = false;
    this.stats = {};
    this.prevStats = null;
    this.key = '';
    this.onData = null; // a data connection arrived (not yet open)
    this.onOpenData = null;
    // A direct link being set up: offered, perhaps answered, not yet in use.
    this.pending = null;
    this.direct = false; // the link in use is a direct one
    this.lostDirect = false; // ...and it broke: only a new handshake brings it back
    // Nothing is registered until resume(): the engine decides when.
    this.stopped = true;
    setInterval(() => this.tick(), TICK_MS);
  }

  open() {
    // Only the signaling side starts over: a direct link does not depend on
    // it and must outlive every retry.
    this.destroy({ keepDirect: true });
    const net = this.getNet();
    this.key = `${net.room}|${net.signal}`;
    // After a failed attempt keep saying "unreachable" while retrying, rather
    // than flipping back to "connecting" every few seconds.
    // A taken room code stays reported as exactly that while retrying.
    if (!this.taken) {
      this.signal = this.failures ? 'disconnected' : 'connecting';
      if (!this.failures) this.error = '';
    }
    this.openedAt = performance.now();

    let peer;
    try {
      peer = new Peer(hostPeerId(net.room), peerOptions(net.signal));
    } catch (err) {
      this.signal = 'error';
      this.error = String(err.message ?? err);
      return;
    }
    this.peer = peer;
    peer.on('open', () => {
      if (peer !== this.peer) return;
      this.signal = 'open';
      this.error = '';
      this.failures = 0;
      this.taken = false;
    });
    peer.on('disconnected', () => {
      if (peer === this.peer && !this.taken) {
        this.signal = 'disconnected';
        this.failures = (this.failures ?? 0) + 1;
      }
    });
    peer.on('error', (err) => {
      if (peer !== this.peer) return;
      if (err.type === 'unavailable-id') {
        if (performance.now() - this.resumedAt < HANDOVER_MS) {
          this.handoverRetry = true;
          return;
        }
        this.taken = true;
        this.takenCount = (this.takenCount ?? 0) + 1;
        // No other window in this browser holds it (only one hosts the
        // engine), so it is a stale registration or another computer. Waiting rarely helps: move to a fresh code.
        if (this.takenCount >= 3) {
          this.takenCount = 0;
          this.onRoomTaken?.();
          return;
        }
        this.signal = 'error';
        this.error = 'This room code is held by another window or computer. The phone is talking to that one, not this one. Checking again; if it stays taken a new room code is made automatically.';
      } else if (err.type !== 'peer-unavailable') {
        this.error = err.type ?? String(err);
      }
    });
    peer.on('call', (call) => {
      if (peer === this.peer) this.acceptCall(call);
    });
    peer.on('connection', (conn) => {
      if (peer === this.peer) this.acceptData(conn);
    });
  }

  destroy({ keepDirect = false } = {}) {
    const { peer } = this;
    this.peer = null;
    // Closed by hand first: PeerJS skips every other connection of a peer
    // when it is destroyed, which would leave the video call open and still
    // decoding in a window that no longer shows it.
    for (const key of ['call', 'conn']) {
      const c = this[key];
      if (!c || (keepDirect && c.direct)) continue;
      this[key] = null;
      this.closeLink(c);
    }
    if (!keepDirect) {
      this.dropPending();
      this.direct = false;
    }
    try {
      peer?.destroy();
    } catch {
      /* already gone */
    }
  }

  closeLink(c) {
    const pc = c?.peerConnection;
    try {
      c?.close();
    } catch {
      /* already closed */
    }
    try {
      pc?.close();
    } catch {
      /* already closed */
    }
  }

  // Releases the room code and stays away until resume().
  shutdown() {
    this.stopped = true;
    this.destroy();
    this.signal = 'connecting';
    this.error = '';
    this.phoneInfo = null;
    this.hold = false;
    this.lostDirect = false;
    this.stats = {};
    this.prevStats = null;
  }

  // Registers (again) under the room code. A code another window of this
  // browser held until a moment ago can still read as taken for an instant,
  // so the first attempts after a start retry quickly and do not count
  // towards moving to a new code.
  resume() {
    if (!this.stopped) return;
    this.stopped = false;
    this.taken = false;
    this.takenCount = 0;
    this.failures = 0;
    this.resumedAt = performance.now();
    // A direct link made while this engine was stopped (an introduction) is
    // ready to use the moment it starts.
    const spare = this.pending?.main.readyState === 'open' ? this.pending : null;
    this.open();
    if (spare) this.adopt(spare);
  }

  // ------------------------------------------------------ direct links ---

  // First half of a direct handshake. Returns the offer to hand to the phone
  // (by QR code, or through an introduction).
  async makeOffer(codec) {
    this.dropPending();
    const pc = new RTCPeerConnection({ iceServers: [] });
    const main = pc.createDataChannel(MAIN_CHANNEL.label, MAIN_CHANNEL.options);
    const video = pc.addTransceiver('video', { direction: 'recvonly' });
    restrictCodecs(video, codec);
    const p = { id: randomId(), pc, main, video, slim: '', state: 'offered', madeAt: performance.now() };
    this.pending = p;
    // A stopped engine keeps the link in reserve; resume() takes it up.
    main.onopen = () => {
      if (this.pending === p && !this.stopped) this.adopt(p);
    };
    // The phone can answer an introduction over a link held in reserve.
    main.onmessage = (e) => {
      if (this.pending !== p) return;
      try {
        this.onMessage?.(JSON.parse(e.data));
      } catch {
        /* not ours */
      }
    };
    await pc.setLocalDescription(await pc.createOffer());
    p.slim = slimOffer(pc.localDescription.sdp);
    return { id: p.id, offer: await packOffer(p.id, p.slim) };
  }

  // Second half: the phone's token. The link comes up by itself after this.
  async acceptAnswer(token) {
    const answer = unpackAnswer(token);
    const p = this.pending;
    if (!p || p.id !== answer.id) {
      const err = new Error('That code belongs to an earlier attempt. Scan the code on the Mac again with the phone.');
      err.stale = true;
      throw err;
    }
    if (p.state !== 'offered') return; // the same code read twice
    p.state = 'answered';
    await p.pc.setRemoteDescription({ type: 'answer', sdp: buildAnswer(p.slim, answer) });
  }

  dropPending() {
    const p = this.pending;
    this.pending = null;
    try {
      p?.pc.close();
    } catch {
      /* already closed */
    }
  }

  // Whether a link is waiting in reserve, connected and unused.
  get spareReady() {
    return this.pending?.main.readyState === 'open';
  }

  // Whether this window can reach the phone on a direct link, in use or in
  // reserve, and so introduce another window to it.
  get canIntroduce() {
    return this.stopped ? this.spareReady : this.direct && !!this.conn?.open;
  }

  // Introductions. A direct link cannot be rebuilt through a server, so
  // before the picture moves to another window of this browser, that window
  // makes its own link to the phone: its offer travels here over the bus
  // and on to the phone over a link this window has; the phone's answer
  // comes back the same way. Returns false if this window has no such link.
  relay(msg) {
    if (!this.canIntroduce) return false;
    if (this.stopped) this.pending.main.send(JSON.stringify(msg));
    else this.conn.send(msg);
    return true;
  }

  // Puts a finished direct link to use, in place of whatever was there.
  adopt(p) {
    this.pending = null;
    for (const key of ['call', 'conn']) {
      const old = this[key];
      this[key] = null;
      this.closeLink(old);
    }
    this.direct = true;
    this.lostDirect = false;
    const conn = new DirectConn(p.pc, p.main);
    const call = new DirectCall(p.pc);
    this.acceptData(conn);
    this.watchCall(call);
    call.emit('stream', new MediaStream([p.video.receiver.track]));
    conn.emit('open');
  }

  // Called when the room code or signaling server changes.
  refresh() {
    const net = this.getNet();
    if (this.key !== `${net.room}|${net.signal}`) {
      this.taken = false;
      this.takenCount = 0;
      this.failures = 0;
      this.open();
    }
  }

  acceptCall(call) {
    this.watchCall(call);
    call.answer(undefined, { sdpTransform: (sdp) => preferCodec(sdp, this.getCodec?.()) });
  }

  watchCall(call) {
    const old = this.call;
    this.call = call;
    this.prevStats = null;
    if (old && old !== call) old.close();
    call.on('stream', (stream) => {
      if (call !== this.call) return;
      this.hold = false;
      this.feed.setStream(stream);
      // Ask for the smallest jitter buffer the network allows: latency
      // matters more here than the odd dropped frame.
      for (const receiver of call.peerConnection?.getReceivers() ?? []) {
        try {
          receiver.jitterBufferTarget = 0;
          receiver.playoutDelayHint = 0;
        } catch {
          /* not supported */
        }
      }
    });
    call.on('close', () => {
      if (this.call === call) this.call = null;
    });
    call.on('error', (err) => console.warn('[phone] media error', err));
  }

  acceptData(conn) {
    const old = this.conn;
    this.conn = conn;
    if (old && old !== conn) old.close();
    this.onData?.(conn);
    conn.on('open', () => {
      if (conn !== this.conn) return;
      this.hold = false;
      this.lastHeardAt = performance.now();
      this.onOpenData?.(conn);
    });
    conn.on('data', (msg) => {
      if (conn !== this.conn || !msg || typeof msg !== 'object') return;
      this.lastHeardAt = performance.now();
      if (msg.t === 'ping') {
        conn.send({ t: 'pong', ts: msg.ts });
      } else if (msg.t === 'hold') {
        this.hold = !!msg.on;
      } else if (msg.t === 'info') {
        this.phoneInfo = { ...this.phoneInfo, ...msg.info };
      } else {
        this.onMessage?.(msg);
      }
    });
    conn.on('close', () => {
      if (this.conn === conn) this.conn = null;
    });
    conn.on('error', (err) => console.warn('[phone] data error', err));
  }

  // A direct link has no server to rebuild it through: once its messages
  // stop, the video half goes with them and the operator is told.
  checkDirect() {
    const p = this.pending;
    if (p && ['failed', 'closed'].includes(p.pc.connectionState)) this.dropPending();
    if (!this.direct || this.conn) return;
    const call = this.call;
    this.call = null;
    this.closeLink(call);
    this.direct = false;
    this.lostDirect = !this.stopped;
  }

  send(msg) {
    if (this.conn?.open) this.conn.send(msg);
  }

  tick() {
    this.checkDirect();
    if (this.stopped) return;
    const now = performance.now();
    const peer = this.peer;
    if (!peer || peer.destroyed) {
      if (now - this.openedAt > (this.handoverRetry ? 400 : 3000)) {
        this.handoverRetry = false;
        this.open();
      }
      return;
    }
    // Some networks swallow the connection without refusing it: no error ever
    // arrives. Give up on the attempt, say so, and start a fresh one.
    if (!peer.open && !peer.disconnected && now - this.openedAt > CONNECT_TIMEOUT_MS) {
      this.failures = (this.failures ?? 0) + 1;
      this.error = 'no answer';
      this.open();
      return;
    }
    if (peer.disconnected && now - this.lastReconnectAt > 3000) {
      this.lastReconnectAt = now;
      try {
        peer.reconnect();
      } catch {
        /* retried next tick */
      }
    }
    for (const key of ['call', 'conn']) {
      const state = this[key]?.peerConnection?.connectionState;
      if (state === 'failed' || state === 'closed') {
        try {
          this[key].close();
        } catch {
          /* already closed */
        }
        this[key] = null;
      }
    }
    this.pollStats();
  }

  async pollStats() {
    const pc = this.call?.peerConnection;
    if (!pc || pc.connectionState !== 'connected') {
      this.stats = {};
      this.prevStats = null;
      return;
    }
    let report;
    try {
      report = await pc.getStats();
    } catch {
      return;
    }
    let inbound = null;
    let pair = null;
    const byId = new Map();
    report.forEach((s) => {
      byId.set(s.id, s);
      if (s.type === 'inbound-rtp' && s.kind === 'video') inbound = s;
      if (s.type === 'candidate-pair' && s.nominated && s.state === 'succeeded') pair = s;
    });
    const stats = {};
    if (inbound) {
      const prev = this.prevStats;
      if (prev && inbound.timestamp > prev.timestamp) {
        const dt = (inbound.timestamp - prev.timestamp) / 1000;
        stats.kbps = ((inbound.bytesReceived - prev.bytesReceived) * 8) / dt / 1000;
        const emitted = inbound.jitterBufferEmittedCount - prev.jitterBufferEmittedCount;
        if (emitted > 0) stats.jitterBufferMs = ((inbound.jitterBufferDelay - prev.jitterBufferDelay) / emitted) * 1000;
        const decoded = inbound.framesDecoded - prev.framesDecoded;
        if (decoded > 0) stats.decodeMs = ((inbound.totalDecodeTime - prev.totalDecodeTime) / decoded) * 1000;
      }
      this.prevStats = inbound;
      stats.framesDropped = inbound.framesDropped;
      stats.freezes = inbound.freezeCount;
      stats.codec = byId.get(inbound.codecId)?.mimeType?.replace('video/', '') ?? '';
      stats.decoder = inbound.decoderImplementation ?? '';
      stats.hardware = inbound.powerEfficientDecoder;
    }
    if (pair) {
      stats.rttMs = (pair.currentRoundTripTime ?? 0) * 1000;
      const local = byId.get(pair.localCandidateId);
      const remote = byId.get(pair.remoteCandidateId);
      const types = [local?.candidateType, remote?.candidateType];
      stats.route = types.includes('relay') ? 'relayed' : types.every((t) => t === 'host') ? 'direct (LAN)' : 'direct';
    }
    this.stats = stats;
  }

  status(now) {
    const dataOpen = !!this.conn?.open;
    const alive = dataOpen && now - this.lastHeardAt < PHONE_TIMEOUT_MS;
    const mediaState = this.call?.peerConnection?.connectionState ?? 'none';
    return {
      signal: this.signal,
      error: this.error,
      notice: this.notice ?? '',
      phone: alive ? 'connected' : dataOpen ? 'silent' : 'none',
      direct: this.direct,
      lostDirect: this.lostDirect,
      media: mediaState,
      info: alive ? this.phoneInfo : null,
      ...this.stats,
    };
  }
}
