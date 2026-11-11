// Host side of the phone link. /output registers with the signaling server
// under an id derived from the room code and waits. The phone calls in with
// its camera (a PeerJS media connection) and opens a data connection.
//
// A watchdog owns all recovery: whatever breaks, the next tick repairs it.
// Existing peer-to-peer connections are never torn down just because the
// signaling server went away.

import { Peer } from 'peerjs';
import { hostPeerId, peerOptions } from '../shared/net.js';

const TICK_MS = 1000;
const PHONE_TIMEOUT_MS = 4000;

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
    setInterval(() => this.tick(), TICK_MS);
    this.open();
  }

  open() {
    this.destroy();
    const net = this.getNet();
    this.key = `${net.room}|${net.signal}`;
    this.signal = 'connecting';
    this.error = '';
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
    });
    peer.on('disconnected', () => {
      if (peer === this.peer) this.signal = 'disconnected';
    });
    peer.on('error', (err) => {
      if (peer !== this.peer) return;
      if (err.type === 'unavailable-id') {
        this.signal = 'error';
        this.error = 'Room code already in use — is another output window open?';
      } else if (err.type !== 'peer-unavailable') {
        this.error = err.type ?? String(err);
      }
    });
    peer.on('call', (call) => this.acceptCall(call));
    peer.on('connection', (conn) => this.acceptData(conn));
  }

  destroy() {
    const peer = this.peer;
    this.peer = null;
    this.call = null;
    this.conn = null;
    try {
      peer?.destroy();
    } catch {
      /* already gone */
    }
  }

  // Called when the room code or signaling server changes.
  refresh() {
    const net = this.getNet();
    if (this.key !== `${net.room}|${net.signal}`) this.open();
  }

  acceptCall(call) {
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
    call.answer();
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

  send(msg) {
    if (this.conn?.open) this.conn.send(msg);
  }

  tick() {
    const now = performance.now();
    const peer = this.peer;
    if (!peer || peer.destroyed) {
      if (now - this.openedAt > 3000) this.open();
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
      phone: alive ? 'connected' : dataOpen ? 'silent' : 'none',
      media: mediaState,
      info: alive ? this.phoneInfo : null,
      ...this.stats,
    };
  }
}
