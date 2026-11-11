// Pairing and signaling configuration shared by all three pages.
//
// The room code names the PeerJS id of the output window. `signal` is the URL
// of a self-hosted PeerServer (for example wss://192.168.1.10:9000/); empty
// means the public PeerJS cloud. Media never goes through either: only the
// connection handshake does.

const ROOM_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

export function randomRoom(length = 5) {
  const bytes = crypto.getRandomValues(new Uint8Array(length));
  return [...bytes].map((b) => ROOM_ALPHABET[b % ROOM_ALPHABET.length]).join('');
}

export function normalizeRoom(value) {
  return String(value ?? '').toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 8);
}

export function hostPeerId(room) {
  return `third-eye-cam-${normalizeRoom(room).toLowerCase()}-host`;
}

// STUN only, no TURN: on a shared network the phone and the Mac connect
// directly. If they cannot, pairing fails visibly instead of silently
// relaying the show through a server on the internet.
const ICE_SERVERS = [{ urls: 'stun:stun.l.google.com:19302' }];

export function peerOptions(signal) {
  const options = { debug: 1, config: { iceServers: ICE_SERVERS } };
  if (!signal) return options;
  try {
    const url = new URL(signal);
    const secure = url.protocol === 'wss:' || url.protocol === 'https:';
    options.host = url.hostname;
    options.port = Number(url.port) || (secure ? 443 : 80);
    options.path = url.pathname || '/';
    options.secure = secure;
    const key = url.searchParams.get('key');
    if (key) options.key = key;
  } catch {
    console.warn('[net] invalid signaling URL, using the PeerJS cloud:', signal);
  }
  return options;
}

export function phoneUrl(net, from = location.href) {
  const url = new URL('../phone/', from);
  url.searchParams.set('room', net.room);
  if (net.signal) url.searchParams.set('sig', net.signal);
  return url.href;
}

export function parsePhoneParams(search = location.search) {
  const q = new URLSearchParams(search);
  return { room: normalizeRoom(q.get('room')), signal: q.get('sig') ?? '' };
}

// Phone -> host stream quality presets.
export const QUALITY = {
  '360p30': { label: '360p · 30 fps', width: 640, height: 360, fps: 30, kbps: 1200 },
  '720p30': { label: '720p · 30 fps', width: 1280, height: 720, fps: 30, kbps: 3500 },
  '720p60': { label: '720p · 60 fps', width: 1280, height: 720, fps: 60, kbps: 5000 },
  '1080p30': { label: '1080p · 30 fps', width: 1920, height: 1080, fps: 30, kbps: 7000 },
  '1080p60': { label: '1080p · 60 fps', width: 1920, height: 1080, fps: 60, kbps: 10000 },
};
export const DEFAULT_QUALITY = '720p30';
