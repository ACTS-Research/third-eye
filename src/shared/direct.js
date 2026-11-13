// Pairing with no pairing server. The normal route hands the WebRTC
// handshake to a server on the internet; here it travels by QR code instead,
// so the phone and the Mac only need to be on the same local network.
//
//   Mac  -> phone   the offer, slimmed and compressed, in the pairing link
//                   (the phone's camera reads it off the Mac's screen)
//   phone -> Mac    a short token with the phone's half (the Mac's camera
//                   reads it off the phone's screen)
//
// The phone gets the Mac's real offer. The Mac never sees the phone's real
// answer: it rebuilds one from its own offer plus the token (ICE user name
// and password, certificate fingerprint, addresses), which keeps the phone's
// code small enough for a laptop camera to read. The Mac's own addresses are
// left out of the offer on purpose: the Mac always makes the first move
// towards the phone, so the phone needs none, and with none it cannot give
// up waiting while its code is being shown to the Mac.
//
// The same exchange, carried over an existing link instead of QR codes,
// introduces the phone to another window of the same browser (see
// "introductions" in src/engine/remote.js).

import { SENSOR_CHANNEL } from './protocol.js';

// The reliable channel for messages; like the sensor channel it is agreed in
// advance, so neither side has to announce it.
export const MAIN_CHANNEL = Object.freeze({ label: 'main', options: Object.freeze({ negotiated: true, id: 1 }) });
export { SENSOR_CHANNEL };

// What the phone's QR code starts with, so other codes are ignored.
export const ANSWER_PREFIX = '3EYE.';
// Fragment key of the offer in the pairing link.
export const OFFER_KEY = 'o';

const b64 = {
  encode(bytes) {
    let s = '';
    for (const b of bytes) s += String.fromCharCode(b);
    return btoa(s).replaceAll('+', '-').replaceAll('/', '_').replace(/=+$/, '');
  },
  decode(text) {
    const s = atob(text.replaceAll('-', '+').replaceAll('_', '/'));
    return Uint8Array.from(s, (c) => c.charCodeAt(0));
  },
};

async function pipe(bytes, stream) {
  const writer = stream.writable.getWriter();
  writer.write(bytes);
  writer.close();
  return new Uint8Array(await new Response(stream.readable).arrayBuffer());
}

export function randomId(length = 4) {
  const alphabet = 'abcdefghijkmnpqrstuvwxyz23456789';
  return [...crypto.getRandomValues(new Uint8Array(length))].map((b) => alphabet[b % alphabet.length]).join('');
}

// --------------------------------------------------------------- offer ---

// Header extensions worth their bytes: bandwidth estimation, the phone's
// rotation, and telling the streams apart.
const KEEP_EXTMAP = /abs-send-time|video-orientation|transport-wide-cc|sdes:mid$/;
const DROP_LINE = /^(o=|s=|t=|a=(msid-semantic|extmap-allow-mixed|ice-options|rtcp:|candidate|end-of-candidates|ssrc|msid))/;

// The offer without what the phone can do without. This exact text is what
// the phone answers, and what the Mac builds the phone's answer from.
export function slimOffer(sdp) {
  return sdp
    .split(/\r?\n/)
    .filter((l) => l && !DROP_LINE.test(l) && (!l.startsWith('a=extmap:') || KEEP_EXTMAP.test(l)))
    .join('\n');
}

function fullSdp(slim) {
  const lines = slim.split('\n');
  // Session lines every SDP must carry; their values do not matter.
  lines.splice(1, 0, 'o=- 1 1 IN IP4 127.0.0.1', 's=-', 't=0 0');
  return `${lines.join('\r\n')}\r\n`;
}

// An offer is mostly boilerplate, and too short for compression to find
// that out by itself. Each phrase below is swapped for one control
// character before compressing (none of them can occur in an SDP), and back
// afterwards; anything not listed passes through untouched, so nothing is
// lost if a browser words its offer differently. Longest first.
const PHRASES = [
  'http://www.ietf.org/id/draft-holmer-rmcat-transport-wide-cc-extensions-01',
  'level-asymmetry-allowed=1;packetization-mode=1;profile-level-id=',
  'http://www.webrtc.org/experiments/rtp-hdrext/abs-send-time',
  'm=application 9 UDP/DTLS/SCTP webrtc-datachannel',
  'urn:ietf:params:rtp-hdrext:sdes:mid',
  'm=video 9 UDP/TLS/RTP/SAVPF ',
  'urn:3gpp:video-orientation',
  'a=max-message-size:262144',
  'a=fingerprint:sha-256 ',
  'a=rtcp-xr:rcvr-rtt=all',
  'a=group:BUNDLE 0 1',
  'c=IN IP4 0.0.0.0',
  'a=sctp-port:5000',
  'a=setup:actpass',
  'a=ice-ufrag:',
  'a=rtcp-rsize',
  'profile-id=0',
  ' H264/90000',
  'a=rtcp-mux',
  'a=recvonly',
  'a=ice-pwd:',
  'a=rtcp-fb:',
  ' rtx/90000',
  ' VP8/90000',
  ' VP9/90000',
  'a=rtpmap:',
  'a=extmap:',
  'a=fmtp:',
  'a=mid:',
];
// One control character per phrase, leaving out tab, line feed and carriage
// return. A phrase beyond the end of this list is simply left as it is.
const CODES = [...[...Array(31).keys()].map((i) => i + 1).filter((c) => ![9, 10, 13].includes(c)), 127].map((c) => String.fromCharCode(c));
// The feedback every video format asks for, always these five lines.
const FEEDBACK = ['goog-remb', 'transport-cc', 'ccm fir', 'nack', 'nack pli'];
const ALL_FEEDBACK = '*';

export function shorten(slim) {
  const lines = slim.split('\n');
  const out = [];
  for (let i = 0; i < lines.length; i++) {
    const hit = /^a=rtcp-fb:(\d+) goog-remb$/.exec(lines[i]);
    if (hit && FEEDBACK.every((f, k) => lines[i + k] === `a=rtcp-fb:${hit[1]} ${f}`)) {
      out.push(`a=rtcp-fb:${hit[1]} ${ALL_FEEDBACK}`);
      i += FEEDBACK.length - 1;
      continue;
    }
    // The fingerprint as 32 bytes rather than 95 characters.
    const print = /^a=fingerprint:sha-256 ((?:[0-9A-F]{2}:){31}[0-9A-F]{2})$/i.exec(lines[i]);
    out.push(print ? `a=fingerprint:sha-256 ${b64.encode(Uint8Array.from(print[1].split(':'), (h) => parseInt(h, 16)))}` : lines[i]);
  }
  let text = out.join('\n');
  PHRASES.forEach((phrase, i) => {
    if (CODES[i]) text = text.replaceAll(phrase, CODES[i]);
  });
  return text;
}

export function lengthen(text) {
  let slim = text;
  PHRASES.forEach((phrase, i) => {
    if (CODES[i]) slim = slim.replaceAll(CODES[i], phrase);
  });
  const out = [];
  for (const l of slim.split('\n')) {
    const all = /^a=rtcp-fb:(\d+) \*$/.exec(l);
    const print = /^a=fingerprint:sha-256 ([\w-]{43})$/.exec(l);
    if (all) out.push(...FEEDBACK.map((f) => `a=rtcp-fb:${all[1]} ${f}`));
    else if (print) out.push(`a=fingerprint:sha-256 ${[...b64.decode(print[1])].map((b) => b.toString(16).padStart(2, '0').toUpperCase()).join(':')}`);
    else out.push(l);
  }
  return out.join('\n');
}

export async function packOffer(id, slim) {
  const bytes = await pipe(new TextEncoder().encode(`${id}\n${shorten(slim)}`), new CompressionStream('deflate-raw'));
  return b64.encode(bytes);
}

export async function unpackOffer(packed) {
  const text = new TextDecoder().decode(await pipe(b64.decode(packed), new DecompressionStream('deflate-raw')));
  const cut = text.indexOf('\n');
  const id = text.slice(0, cut);
  const slim = lengthen(text.slice(cut + 1));
  if (!/^[a-z0-9]{2,8}$/.test(id) || !slim.startsWith('v=0')) throw new Error('not a pairing offer');
  return { id, sdp: fullSdp(slim) };
}

// Offers only the chosen codec family (and its retransmission format), so
// the offer stays small. Falls back to whatever the browser has.
export function restrictCodecs(transceiver, codec) {
  const all = RTCRtpReceiver.getCapabilities?.('video')?.codecs ?? [];
  const is = (c, name) => c.mimeType.toLowerCase() === `video/${name}`;
  const h264 = all.filter((c) => is(c, 'h264') && /packetization-mode=1/.test(c.sdpFmtpLine ?? '') && /profile-level-id=42/.test(c.sdpFmtpLine ?? ''));
  const vp8 = all.filter((c) => is(c, 'vp8'));
  const vp9 = all.filter((c) => is(c, 'vp9') && /profile-id=0/.test(c.sdpFmtpLine ?? ''));
  const families = { h264: [...h264, ...vp8], vp8, vp9: [...vp9, ...vp8], auto: [...h264, ...vp8] };
  const picked = families[codec]?.length ? families[codec] : families.auto;
  if (!picked.length) return;
  try {
    transceiver.setCodecPreferences([...picked, ...all.filter((c) => is(c, 'rtx'))]);
  } catch {
    /* the full list is offered instead; the code is just denser */
  }
}

// -------------------------------------------------------------- answer ---

const IPV4 = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/;
const MAX_CANDIDATES = 4;

// The phone's half of the handshake, as a short string.
export function packAnswer(id, sdp) {
  const lines = sdp.split(/\r?\n/);
  const value = (prefix) => lines.find((l) => l.startsWith(prefix))?.slice(prefix.length) ?? '';
  const ufrag = value('a=ice-ufrag:');
  const pwd = value('a=ice-pwd:');
  const print = value('a=fingerprint:sha-256 ').split(':').map((h) => parseInt(h, 16));
  if (!ufrag || !pwd || print.length !== 32 || print.some(Number.isNaN)) throw new Error('unexpected answer');
  const active = value('a=setup:') !== 'passive';

  const seen = new Set();
  const candidates = [];
  for (const l of lines) {
    if (!l.startsWith('a=candidate:')) continue;
    const [, component, transport, , address, port] = l.split(' ');
    if (component !== '1' || transport.toLowerCase() !== 'udp' || seen.has(`${address} ${port}`)) continue;
    seen.add(`${address} ${port}`);
    candidates.push({ address, port: Number(port) });
  }
  // Plain IPv4 first: it is what a hotspot or a home network hands out.
  const rank = (c) => (IPV4.test(c.address) ? 0 : c.address.includes(':') ? 2 : 1);
  candidates.sort((a, b) => rank(a) - rank(b));

  const out = [1, active ? 1 : 0];
  const text = (s) => {
    const bytes = new TextEncoder().encode(s);
    out.push(bytes.length, ...bytes);
  };
  text(id);
  text(ufrag);
  text(pwd);
  out.push(...print);
  const list = candidates.slice(0, MAX_CANDIDATES);
  out.push(list.length);
  for (const c of list) {
    const v4 = IPV4.exec(c.address);
    if (v4) out.push(4, ...v4.slice(1).map(Number));
    else {
      out.push(0);
      text(c.address);
    }
    out.push(c.port >> 8, c.port & 255);
  }
  return b64.encode(Uint8Array.from(out));
}

export function unpackAnswer(token) {
  const bytes = b64.decode(token);
  let at = 0;
  const byte = () => {
    if (at >= bytes.length) throw new Error('short token');
    return bytes[at++];
  };
  const text = () => {
    const n = byte();
    const s = new TextDecoder().decode(bytes.subarray(at, at + n));
    at += n;
    return s;
  };
  if (byte() !== 1) throw new Error('unknown token version');
  const active = byte() === 1;
  const id = text();
  const ufrag = text();
  const pwd = text();
  const print = [...bytes.subarray(at, at + 32)].map((b) => b.toString(16).padStart(2, '0').toUpperCase()).join(':');
  at += 32;
  const candidates = [];
  for (let n = byte(); n > 0; n--) {
    const kind = byte();
    const address = kind === 4 ? [byte(), byte(), byte(), byte()].join('.') : text();
    candidates.push({ address, port: (byte() << 8) | byte() });
  }
  if (!ufrag || !pwd || print.length !== 95) throw new Error('bad token');
  return { id, active, ufrag, pwd, print, candidates };
}

// The answer the phone must have given, written in terms of the offer it
// was sent. `slim` is the offer exactly as the phone received it.
export function buildAnswer(slim, a) {
  const out = [];
  let section = 0;
  for (const l of fullSdp(slim).split('\r\n')) {
    if (!l) continue;
    if (l.startsWith('m=')) section++;
    if (l.startsWith('a=setup:')) out.push(`a=setup:${a.active ? 'active' : 'passive'}`);
    else if (l.startsWith('a=ice-ufrag:')) out.push(`a=ice-ufrag:${a.ufrag}`);
    else if (l.startsWith('a=ice-pwd:')) out.push(`a=ice-pwd:${a.pwd}`);
    else if (l.startsWith('a=fingerprint:')) out.push(`a=fingerprint:sha-256 ${a.print}`);
    else if (l === 'a=recvonly') out.push('a=sendonly');
    else out.push(l);
    // Everything shares one transport, so the addresses go in once.
    if (section === 1 && l.startsWith('c=')) {
      a.candidates.forEach((c, i) => out.push(`a=candidate:${i + 1} 1 udp ${2113937151 - i} ${c.address} ${c.port} typ host`));
    }
  }
  return `${out.join('\r\n')}\r\n`;
}

// ------------------------------------------------------------ plumbing ---

// Resolves once the browser has found its addresses: when it says so, or
// when no new one has turned up for a moment.
export function gathered(pc, { quiet = 400, max = 2500 } = {}) {
  return new Promise((resolve) => {
    if (pc.iceGatheringState === 'complete') return resolve();
    let timer = 0;
    const done = () => {
      clearTimeout(timer);
      clearTimeout(limit);
      resolve();
    };
    const limit = setTimeout(done, max);
    pc.addEventListener('icegatheringstatechange', () => {
      if (pc.iceGatheringState === 'complete') done();
    });
    pc.addEventListener('icecandidate', (e) => {
      if (!e.candidate) return done();
      clearTimeout(timer);
      timer = setTimeout(done, quiet);
    });
  });
}

class Emitter {
  constructor() {
    this.handlers = new Map();
  }

  on(type, fn) {
    if (!this.handlers.has(type)) this.handlers.set(type, []);
    this.handlers.get(type).push(fn);
    return this;
  }

  emit(type, ...args) {
    for (const fn of this.handlers.get(type) ?? []) fn(...args);
  }
}

// The two halves of a direct link, shaped like the PeerJS connections the
// rest of the code already works with: `conn` carries messages, `call` the
// video. Both sit on one RTCPeerConnection, which `conn` owns.
export class DirectConn extends Emitter {
  constructor(pc, channel) {
    super();
    this.direct = true;
    this.peerConnection = pc;
    this.channel = channel;
    channel.onmessage = (e) => {
      let msg;
      try {
        msg = JSON.parse(e.data);
      } catch {
        return;
      }
      this.emit('data', msg);
    };
    channel.onclose = () => this.emit('close');
  }

  get open() {
    return this.channel.readyState === 'open';
  }

  send(msg) {
    this.channel.send(JSON.stringify(msg));
  }

  close() {
    try {
      this.peerConnection.close();
    } catch {
      /* already closed */
    }
    this.emit('close');
  }
}

export class DirectCall extends Emitter {
  constructor(pc) {
    super();
    this.direct = true;
    this.peerConnection = pc;
  }

  // The link lives and dies with its `conn`.
  close() {}
}
