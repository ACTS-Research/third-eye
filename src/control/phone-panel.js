// Pairing: room code, QR code for the phone, and the signaling server setting.

import qrcode from 'qrcode-generator';
import { normalizeRoom, phoneUrl, randomRoom } from '../shared/net.js';
import { currentPalette } from '../shared/palette.js';
import { CODECS } from '../shared/sdp.js';
import { el } from '../shared/util.js';

function drawQr(canvas, text) {
  const qr = qrcode(0, 'M');
  qr.addData(text);
  qr.make();
  const n = qr.getModuleCount();
  const quiet = 3;
  const scale = Math.max(2, Math.floor(canvas.width / (n + quiet * 2)));
  const size = (n + quiet * 2) * scale;
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#fff';
  ctx.fillRect(0, 0, size, size);
  ctx.fillStyle = '#000';
  for (let r = 0; r < n; r++) {
    for (let c = 0; c < n; c++) {
      if (qr.isDark(r, c)) ctx.fillRect((c + quiet) * scale, (r + quiet) * scale, scale, scale);
    }
  }
}

export function mountPhonePanel(root, ui) {
  const { store } = ui;
  const qr = el('canvas', { id: 'qr', width: 320, height: 320 });
  const code = el('div', { id: 'room-code' });
  const link = el('a', { id: 'phone-link', class: 'small', target: '_blank', rel: 'noopener' });
  const warn = el('div', { class: 'small keep-2', style: 'font-weight:700' });
  const state = el('div', { id: 'phone-state', class: 'small dim keep-6' });

  // The same pairing details as a pop-over under the top bar: click the
  // phone or input status there and they appear without leaving the screen.
  const popQr = el('canvas', { width: 320, height: 320 });
  const popCode = el('div', { class: 'pop-code' });
  const popState = el('div', { class: 'small keep-6' });
  // The connection as four steps, so a failure names the step it is at.
  const popSteps = el('ol', { class: 'steps' });
  const popLink = el('div', { class: 'small dim', style: 'word-break:break-all' });
  const pop = el('div', { id: 'pairing-pop', hidden: true, role: 'dialog', 'aria-label': 'Pair the phone' }, [
    popQr,
    el('div', { class: 'grow' }, [
      el('div', { class: 'caps dim', text: 'Room code' }),
      popCode,
      popState,
      popSteps,
      popLink,
      el('div', { class: 'row wrap', style: 'margin-top:8px' }, [
        el('button', { text: 'Restart output', title: 'Close every output window in this browser and open a new one', onclick: () => ui.restartOutput?.() }),
        el('button', { text: 'New room code', title: 'The phone must scan again', onclick: () => store.merge('net', { room: randomRoom() }) }),
        el('button', { text: 'Pairing settings', onclick: () => { hidePop(); ui.setView('setup'); } }),
        el('button', { text: 'Close', onclick: () => hidePop() }),
      ]),
    ]),
  ]);
  document.body.append(pop);
  let anchor = null;
  const hidePop = () => {
    pop.hidden = true;
  };
  ui.togglePairing = (from) => {
    if (!pop.hidden && anchor === from) return hidePop();
    anchor = from;
    const r = from.getBoundingClientRect();
    pop.style.top = `${r.bottom + 10}px`;
    pop.style.left = `${Math.max(8, Math.min(r.left, window.innerWidth - 550))}px`;
    pop.hidden = false;
  };
  document.addEventListener('pointerdown', (e) => {
    if (!pop.hidden && !pop.contains(e.target) && !e.target.closest?.('.pill')) hidePop();
  });
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') hidePop();
  });

  const signal = el('input', {
    type: 'text',
    class: 'grow',
    placeholder: 'PeerJS cloud (default) — or wss://host:port/path',
    spellcheck: false,
    onchange: () => store.merge('net', { signal: signal.value.trim() }),
  });
  const roomEdit = el('input', {
    type: 'text',
    style: 'width:110px;text-transform:uppercase',
    maxLength: 8,
    spellcheck: false,
    onchange: () => {
      const room = normalizeRoom(roomEdit.value);
      if (room.length >= 4) store.merge('net', { room });
      else sync();
    },
  });

  const codec = el('select', {
    id: 'codec',
    class: 'grow',
    'aria-label': 'Video codec',
    onchange: () => store.merge('net', { codec: codec.value }),
  }, Object.entries(CODECS).map(([value, text]) => el('option', { value, text })));

  const sync = () => {
    const net = store.state.net;
    codec.value = net.codec;
    // The phone opens in the same colours as this page.
    const link_ = new URL(phoneUrl(net));
    if (currentPalette() !== 'darkroom') link_.searchParams.set('pal', currentPalette());
    const url = link_.href;
    qr.width = 320;
    drawQr(qr, url);
    popQr.width = 320;
    drawQr(popQr, url);
    popCode.textContent = net.room;
    popLink.textContent = url;
    code.textContent = net.room;
    link.textContent = url;
    link.href = url;
    if (document.activeElement !== signal) signal.value = net.signal;
    if (document.activeElement !== roomEdit) roomEdit.value = net.room;
    const host = new URL(url);
    if (host.protocol !== 'https:') {
      warn.textContent = 'This page is not on HTTPS, so iOS will refuse the camera. Use the deployed site, or npm run dev:https.';
    } else if (['localhost', '127.0.0.1'].includes(host.hostname)) {
      warn.textContent = 'The phone cannot open a localhost address. Use the deployed site or this Mac\'s network address.';
    } else {
      warn.textContent = '';
    }
  };
  store.subscribe((op) => {
    if (op.op === 'replace' || (op.op === 'merge' && op.key === 'net')) sync();
  });

  ui.onPalette?.(sync);

  ui.onStatus((status) => {
    const p = status?.phone;
    let text;
    if (!p) text = 'Open the output window first: it is what the phone connects to.';
    else if (p.signal === 'error') text = p.error;
    else if (p.phone === 'connected') text = p.media === 'connected' ? 'Phone paired and streaming.' : 'Phone paired.';
    else if (p.signal === 'open') text = 'Ready. Scan the code with the iPhone camera.';
    else if (p.signal === 'disconnected') text = `Cannot reach the pairing server${p.error ? ` (${p.error})` : ''}; retrying. Public and guest Wi-Fi often block it: try the iPhone's Personal Hotspot. A phone that is already paired keeps working.`;
    else text = 'Connecting to the pairing server…';
    state.textContent = text;
    popState.textContent = text;

    const paired = p?.phone === 'connected';
    const video = paired && p.media === 'connected';
    const steps = [
      ['Output window open', !!p, 'Open it: it is what the phone connects to.'],
      ['Mac reached the pairing server', p?.signal === 'open' || paired, p?.signal === 'error' ? 'Room code taken elsewhere.' : 'No answer yet. The network may block it.'],
      ['Phone found the Mac', paired, 'Scan the code and tap START on the phone. If the phone says "Mac not found", the code is wrong or stale.'],
      [`Video link${video && p.route ? `: ${p.route}` : ''}`, video, p?.info?.controllerOnly ? 'The phone\'s camera is off (controller only).' : 'Phone and Mac cannot reach each other directly on this network.'],
      ['Picture arriving', video && status.input.kind === 'phone' && status.input.state === 'live', status?.input.kind === 'phone' ? 'Connected, but no frames yet.' : 'Select the iPhone input (key 1).'],
    ];
    popSteps.replaceChildren();
    let failed = false;
    for (const [label, ok, help] of steps) {
      const state = ok ? 'done' : failed ? 'todo' : 'stuck';
      popSteps.append(el('li', { class: state }, [el('b', { text: ok ? 'OK' : failed ? '··' : 'HERE' }), el('span', { text: !ok && !failed ? `${label}. ${help}` : label })]));
      if (!ok) failed = true;
    }
  });

  root.append(
    el('div', { class: 'panel', id: 'phone-panel' }, [
      el('h2', { text: 'Phone' }),
      el('div', { class: 'pair' }, [
        qr,
        el('div', { class: 'grow' }, [
          el('div', { class: 'dim small', text: 'Room code' }),
          code,
          state,
        ]),
      ]),
      warn,
      el('div', { class: 'row' }, [el('span', { class: 'caps', text: 'Codec' }), codec]),
      el('div', { class: 'dim small', text: 'Changing it restarts the phone\'s video for a moment. Status below shows which codec is in use and whether it decodes in hardware.' }),
      el('details', {}, [
        el('summary', { class: 'dim small', text: 'Link and signaling' }),
        el('div', { class: 'row' }, [link]),
        el('div', { class: 'row' }, [
          el('span', { class: 'dim small', text: 'Room' }),
          roomEdit,
          el('button', { text: 'New code', onclick: () => store.merge('net', { room: randomRoom() }) }),
        ]),
        el('div', { class: 'row' }, [signal]),
        el('div', { class: 'dim small', text: 'Changing the room or server drops a paired phone; it must scan again.' }),
      ]),
    ]),
  );
  sync();
}
