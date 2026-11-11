// Puts one video codec first in an SDP so both ends settle on it. If the
// browser does not offer that codec the SDP is returned unchanged.

export const CODECS = { h264: 'H.264 (hardware on iPhone and Mac)', vp8: 'VP8', vp9: 'VP9', auto: 'Browser default' };
export const DEFAULT_CODEC = 'h264';

export function preferCodec(sdp, codec) {
  if (!codec || codec === 'auto' || typeof sdp !== 'string') return sdp;
  const eol = sdp.includes('\r\n') ? '\r\n' : '\n';
  const lines = sdp.split(eol);
  const m = lines.findIndex((l) => l.startsWith('m=video'));
  if (m < 0) return sdp;
  let end = lines.findIndex((l, i) => i > m && l.startsWith('m='));
  if (end < 0) end = lines.length;
  const section = lines.slice(m, end);

  const wanted = [];
  for (const l of section) {
    const hit = /^a=rtpmap:(\d+) ([\w-]+)\//.exec(l);
    if (hit && hit[2].toLowerCase() === codec) wanted.push(hit[1]);
  }
  if (!wanted.length) return sdp;
  // Keep each codec's retransmission payload next to it.
  const first = [];
  for (const pt of wanted) {
    first.push(pt);
    for (const l of section) {
      const rtx = /^a=fmtp:(\d+) apt=(\d+)/.exec(l);
      if (rtx && rtx[2] === pt) first.push(rtx[1]);
    }
  }
  const parts = lines[m].split(' ');
  const payloads = parts.slice(3);
  lines[m] = [...parts.slice(0, 3), ...first.filter((pt) => payloads.includes(pt)), ...payloads.filter((pt) => !first.includes(pt))].join(' ');
  return lines.join(eol);
}
