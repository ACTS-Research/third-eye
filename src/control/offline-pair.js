// "Pair without internet": the handshake by QR code, both ways, for when the
// pairing server cannot be reached. The phone and the Mac only need to be on
// the same local network. See src/shared/direct.js for what travels.
//
//   1. This page asks the engine for an offer and shows it as a QR code (the
//      usual pairing link with the offer after the #).
//   2. The phone opens it, and shows a code of its own.
//   3. This Mac's camera reads that code; it goes to the engine, and the
//      link comes up.
//
// The code is read by Chrome's own barcode reader where there is one, and
// by the bundled jsQR library whenever that finds nothing (or is missing).

import { ANSWER_PREFIX, OFFER_KEY } from '../shared/direct.js';
import { drawQr } from '../shared/qr.js';
import { el } from '../shared/util.js';

// How to get the two devices onto one network with no internet involved.
// (Internet Sharing lists Wi-Fi as a destination only while the source is
// something else; the source does not need to be connected to anything.)
export const NETWORK_TIP =
  'The phone and the Mac must be on the same network. Easiest: join the iPhone\'s Personal Hotspot from the Mac. Or make a closed network on the Mac: System Settings → General → Sharing → Internet Sharing. Set "Share your connection from" to anything but Wi-Fi (Thunderbolt Bridge will do, with nothing plugged in), switch on Wi-Fi under "To devices using", turn Internet Sharing on, then join that network from the iPhone. It has no internet, which is fine.';
export const PAIR_TIP = `Pair by QR code, both ways, when the pairing server cannot be reached. ${NETWORK_TIP}`;

const SCAN_MS = 150;
const OFFER_RETRY_MS = 2500;
// jsQR works on a copy of the frame no wider than this: plenty for the
// phone's small code, and quick enough to run several times a second.
const READ_WIDTH = 1280;

export function mountOfflinePair(ui) {
  const { bus } = ui;
  const qr = el('canvas', { id: 'offline-qr', width: 720, height: 720 });
  const link = el('a', { id: 'offline-link', class: 'small dim', target: '_blank', rel: 'noopener', text: 'Open the link on this Mac instead (for testing)' });
  const video = el('video', { id: 'offline-video', muted: true, playsinline: true, autoplay: true });
  const state = el('div', { id: 'offline-state', class: 'keep-2', role: 'status' });
  const network = el('div', { class: 'small dim' }, [
    'Both must be on the same network: the iPhone\'s hotspot, or one made by this Mac. ',
    el('span', { class: 'tip', id: 'network-tip', tabindex: '0', title: NETWORK_TIP, text: 'How?' }),
  ]);
  const dialog = el('div', { id: 'offline-pair', role: 'dialog', 'aria-label': 'Pair without internet', hidden: true }, [
    el('div', { class: 'offline-head' }, [el('h2', { text: 'Pair without internet' }), el('button', { text: 'Close', onclick: () => close() })]),
    el('div', { class: 'offline-steps' }, [
      el('div', { class: 'offline-step' }, [
        el('div', { class: 'caps', text: '1 · Scan this with the iPhone' }),
        qr,
        el('div', { class: 'small dim', text: 'Point the iPhone\'s camera at the code, open the link and tap START. The phone then shows a code of its own.' }),
        link,
      ]),
      el('div', { class: 'offline-step' }, [
        el('div', { class: 'caps', text: '2 · Show the phone\'s code to this camera' }),
        el('div', { class: 'offline-camera' }, [video]),
        el('div', { class: 'small dim', text: 'Hold the phone up to the camera above the screen, about a hand\'s length away, until it is read.' }),
      ]),
    ]),
    state,
    network,
  ]);
  document.body.append(dialog);

  // Loaded the first time the dialog opens; the page does not carry it
  // otherwise.
  let jsQR = null;
  const frame = document.createElement('canvas');
  function readFrame() {
    if (!jsQR || !video.videoWidth) return '';
    const scale = Math.min(1, READ_WIDTH / video.videoWidth);
    frame.width = Math.round(video.videoWidth * scale);
    frame.height = Math.round(video.videoHeight * scale);
    const ctx = frame.getContext('2d', { willReadFrequently: true });
    ctx.drawImage(video, 0, 0, frame.width, frame.height);
    const image = ctx.getImageData(0, 0, frame.width, frame.height);
    // The phone's code is always black on white: no need to try it inverted.
    return jsQR(image.data, image.width, image.height, { inversionAttempts: 'dontInvert' })?.data ?? '';
  }

  let open = false;
  let scanning = false;
  let req = 0;
  let offerTimer = 0;
  let scanTimer = 0;
  let stream = null;
  let detector = null;
  let lastToken = '';
  let sent = false;
  let done = false;

  const say = (text) => {
    state.textContent = text;
  };

  function requestOffer() {
    clearTimeout(offerTimer);
    if (!open || done) return;
    req++;
    bus.send('pair-offer', { req });
    // No engine yet (the page is still starting, or the picture is moving
    // between windows): ask again shortly.
    offerTimer = setTimeout(requestOffer, OFFER_RETRY_MS);
  }

  bus.on('pair-offer-ready', (m) => {
    if (!open || m.req !== req) return;
    clearTimeout(offerTimer);
    const url = `${ui.phoneLink()}#${OFFER_KEY}=${m.offer}`;
    const modules = drawQr(qr, url, { level: 'L', size: 720 });
    qr.dataset.modules = String(modules);
    link.href = url;
    lastToken = '';
    sent = false;
    if (!state.dataset.problem) say('Waiting for the phone\'s code…');
  });
  bus.on('pair-accepted', () => {
    if (open) say('Code read. Connecting…');
  });
  bus.on('pair-error', (m) => {
    if (!open) return;
    sent = false;
    say(m.message);
  });

  // The phone's code, however it got here (the camera, or a test).
  function answer(text) {
    if (!open || done || !text.startsWith(ANSWER_PREFIX)) return;
    const token = text.slice(ANSWER_PREFIX.length);
    if (sent && token === lastToken) return;
    lastToken = token;
    sent = true;
    delete state.dataset.problem;
    bus.send('pair-answer', { token });
  }
  ui.pairOfflineAnswer = answer;

  async function startCamera() {
    if (!jsQR) {
      import('jsqr')
        .then((m) => {
          jsQR = m.default ?? m;
        })
        .catch((err) => console.warn('[pair] the code reader did not load', err));
    }
    try {
      detector = 'BarcodeDetector' in window ? new window.BarcodeDetector({ formats: ['qr_code'] }) : null;
    } catch {
      detector = null;
    }
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: false, video: { facingMode: 'user', width: { ideal: 1920 }, height: { ideal: 1080 } } });
    } catch (err) {
      state.dataset.problem = '1';
      say(err.name === 'NotAllowedError' ? 'Allow the camera for this page: it is what reads the phone\'s code.' : `The camera could not be opened: ${err.message || err.name}`);
      return;
    }
    if (!open) return stopCamera();
    video.srcObject = stream;
    video.play().catch(() => {});
    scanTimer = setInterval(async () => {
      if (!open || done || scanning || video.readyState < 2) return;
      scanning = true;
      try {
        let found = false;
        for (const code of (await detector?.detect(video)) ?? []) {
          if (!code.rawValue?.startsWith(ANSWER_PREFIX)) continue;
          found = true;
          answer(code.rawValue);
        }
        if (!found) answer(readFrame());
      } catch {
        /* a frame that could not be read; the next one will */
      } finally {
        scanning = false;
      }
    }, SCAN_MS);
  }

  function stopCamera() {
    clearInterval(scanTimer);
    for (const track of stream?.getTracks() ?? []) track.stop();
    stream = null;
    video.srcObject = null;
  }

  function show() {
    if (open) return;
    open = true;
    done = false;
    sent = false;
    lastToken = '';
    delete state.dataset.problem;
    dialog.hidden = false;
    say('Preparing the code…');
    requestOffer();
    startCamera();
  }

  function close() {
    if (!open) return;
    open = false;
    clearTimeout(offerTimer);
    stopCamera();
    dialog.hidden = true;
    if (!done) bus.send('pair-cancel');
  }

  ui.onStatus((status) => {
    if (!open || done || !sent) return;
    const p = status?.phone;
    if (p?.direct && p.phone === 'connected') {
      done = true;
      say('Paired.');
      setTimeout(close, 1200);
    }
  });
  // The picture moved to another window: its engine needs to make the offer.
  ui.onHost(() => {
    if (open && !done) requestOffer();
  });
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') close();
  });

  ui.pairOffline = show;
  ui.closePairOffline = close;
}
