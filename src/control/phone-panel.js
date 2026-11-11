// Pairing: room code, QR code for the phone, and the signaling server setting.

import qrcode from 'qrcode-generator';
import { normalizeRoom, phoneUrl, randomRoom } from '../shared/net.js';
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
  const warn = el('div', { class: 'small', style: 'color:var(--warn)' });
  const state = el('div', { id: 'phone-state', class: 'small dim' });

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

  const sync = () => {
    const net = store.state.net;
    const url = phoneUrl(net);
    qr.width = 320;
    drawQr(qr, url);
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

  ui.onStatus((status) => {
    const p = status?.phone;
    if (!p) {
      state.textContent = 'Open the output window to accept the phone.';
      return;
    }
    if (p.signal === 'error') state.textContent = p.error;
    else if (p.phone === 'connected') state.textContent = 'Phone paired.';
    else if (p.signal === 'open') state.textContent = 'Ready — scan the code with the iPhone camera.';
    else if (p.signal === 'disconnected') state.textContent = `Signaling server unreachable${p.error ? ` (${p.error})` : ''} — retrying. A phone that is already paired keeps working.`;
    else state.textContent = 'Connecting to the signaling server…';
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
