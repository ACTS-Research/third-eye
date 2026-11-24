// Pairing: room code, QR code for the phone, and the signaling server setting.

import { normalizeRoom, phoneUrl, randomRoom, roomB } from '../shared/net.js';
import { currentDim, currentPalette } from '../shared/palette.js';
import { drawQr } from '../shared/qr.js';
import { CODECS } from '../shared/sdp.js';
import { el } from '../shared/util.js';
import { menu } from './controls.js';
import { PAIR_TIP } from './offline-pair.js';

export function mountPhonePanel(root, ui) {
  const { store } = ui;
  const qr = el('canvas', { id: 'qr', width: 320, height: 320 });
  const code = el('div', { id: 'room-code' });
  const link = el('a', { id: 'phone-link', class: 'small', target: '_blank', rel: 'noopener' });
  const warn = el('div', { class: 'small keep-2', style: 'font-weight:700' });
  const state = el('div', { id: 'phone-state', class: 'small dim keep-6' });

  // The same pairing details as a pop-over under the top bar: click the
  // phone status there and they appear without leaving the screen.
  const popQr = el('canvas', { width: 320, height: 320 });
  const popCode = el('div', { class: 'pop-code' });
  const popState = el('div', { class: 'small keep-6' });
  // The connection as five steps, so a failure names the step it is at.
  const popSteps = el('ol', { class: 'steps' });
  const popLink = el('div', { class: 'small dim', style: 'word-break:break-all' });
  // A tab for each phone: the pop-over shows one phone's code and steps at a
  // time, so the wrong phone can never be pointed at a code. Opening the
  // second tab is what switches the second phone on (net.second).
  let which = 'a';
  const tabs = {
    a: el('button', { id: 'pair-tab-a', role: 'tab', onclick: () => showPhone('a') }),
    b: el('button', { id: 'pair-tab-b', role: 'tab', onclick: () => showPhone('b') }),
  };
  const popCodeLabel = el('div', { class: 'caps dim', text: 'Room code' });
  const stopB = el('button', { id: 'pair-stop-b', text: 'Stop using iPhone B', title: 'Lets go of its room code. A paired second phone is dropped.', onclick: () => { setKept(false); store.merge('net', { second: false }); showPhone('a'); } });
  const pairOffline = el('button', { class: 'pair-offline', text: 'Pair without internet', title: PAIR_TIP, onclick: () => { hidePop(); ui.pairOffline?.(); } });
  function showPhone(next) {
    which = next;
    if (which === 'b' && !store.state.net.second) store.merge('net', { second: true });
    sync();
    render(ui.status);
  }
  const pop = el('div', { id: 'pairing-pop', hidden: true, role: 'dialog', 'aria-label': 'Pair the phone' }, [
    el('div', { class: 'pair-tabs', role: 'tablist' }, [tabs.a, tabs.b]),
    popQr,
    el('div', { class: 'grow' }, [
      popCodeLabel,
      popCode,
      popState,
      popSteps,
      popLink,
      el('div', { class: 'row wrap', style: 'margin-top:8px' }, [
        el('button', { text: 'Restart output', title: 'Close every output window in this browser and open a new one', onclick: () => ui.restartOutput?.() }),
        el('button', { text: 'New room code', title: 'The phone must scan again', onclick: () => store.merge('net', { room: randomRoom() }) }),
        pairOffline,
        stopB,
        el('button', { text: 'Pairing settings', onclick: () => { hidePop(); ui.setView('setup'); } }),
        el('button', { text: 'Close', onclick: () => hidePop() }),
      ]),
    ]),
  ]);
  document.body.append(pop);
  let anchor = null;
  // Opened to pair a phone (none was paired at the time): once one pairs
  // the pop-over has done its job and closes by itself. Opened with a phone
  // already paired, to look at the connection, it stays.
  let forPairing = false;
  let closeTimer = 0;
  // Looking at the second phone's tab switches it on, so its code can be
  // scanned at once. If none has ever paired by the time the pop-over
  // closes, it is switched off again: a glance must not leave a show with
  // a second room code and a longer top bar. Once one has paired it stays
  // until Stop using iPhone B.
  const KEPT_KEY = 'thirdeye.secondKept';
  const kept = () => {
    try {
      return localStorage.getItem(KEPT_KEY) === '1';
    } catch {
      return false;
    }
  };
  const setKept = (on) => {
    try {
      if (on) localStorage.setItem(KEPT_KEY, '1');
      else localStorage.removeItem(KEPT_KEY);
    } catch {
      /* no storage: the second phone then switches off when not paired */
    }
  };
  ui.onStatus?.((status) => {
    if (status?.phoneB?.phone === 'connected' && !kept()) setKept(true);
  });
  const hidePop = () => {
    if (!pop.hidden && store.state.net.second && !kept() && ui.status?.phoneB?.phone !== 'connected') store.merge('net', { second: false });
    pop.hidden = true;
    forPairing = false;
    clearTimeout(closeTimer);
    closeTimer = 0;
  };
  // `phone` ('a' or 'b') opens it at that phone's tab.
  ui.togglePairing = (from, phone = 'a') => {
    if (!pop.hidden && anchor === from) return hidePop();
    which = phone;
    sync();
    render(ui.status);
    forPairing = (which === 'b' ? ui.status?.phoneB : ui.status?.phone)?.phone !== 'connected';
    anchor = from;
    const r = from.getBoundingClientRect();
    pop.style.top = `${r.bottom + 10}px`;
    pop.style.left = `${Math.max(8, Math.min(r.left, window.innerWidth - 550))}px`;
    pop.hidden = false;
  };
  document.addEventListener('pointerdown', (e) => {
    if (!pop.hidden && !pop.contains(e.target) && !e.target.closest?.('#phone-pill')) hidePop();
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

  const codec = menu({
    id: 'codec',
    cls: 'grow',
    label: 'Video codec',
    options: Object.entries(CODECS).map(([value, label]) => ({ value, label })),
    value: store.state.net.codec,
    onChange: (v) => store.merge('net', { codec: v }),
  });

  let currentUrl = '';
  let popUrl = '';
  // The second phone's pairing link, for the tests.
  ui.phoneLinkB = () => {
    const u = new URL(currentUrl);
    u.searchParams.set('room', roomB(store.state.net.room));
    return u.href;
  };
  // The pairing link as shown in the QR codes (room, palette, dimmer).
  ui.phoneLink = () => currentUrl;

  const sync = () => {
    const net = store.state.net;
    codec.set(net.codec);
    // The phone opens in the same colours and dimmer as this page; once
    // paired, the engine keeps it in step.
    const link_ = new URL(phoneUrl(net));
    if (currentPalette() !== 'darkroom') link_.searchParams.set('pal', currentPalette());
    if (currentDim() !== 100) link_.searchParams.set('dim', String(currentDim()));
    const url = link_.href;
    currentUrl = url;
    qr.width = 320;
    drawQr(qr, url);
    // The pop-over shows the phone its tab is on. The second phone's link is
    // the same link under its own room.
    const second = which === 'b';
    const rb = roomB(net.room);
    const popLink_ = new URL(url);
    if (second) popLink_.searchParams.set('room', rb);
    popUrl = popLink_.href;
    popQr.width = 320;
    drawQr(popQr, popUrl);
    popCode.textContent = second ? `${rb.slice(0, -1)}-B` : net.room;
    popCodeLabel.textContent = second ? 'Room code · iPhone B' : 'Room code';
    popLink.textContent = popUrl;
    for (const [key, tab] of Object.entries(tabs)) tab.setAttribute('aria-selected', String(key === which));
    stopB.hidden = !second;
    // (Pairing the second phone without internet is not built yet.)
    pairOffline.hidden = second;
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

  // What one phone's link is doing, in a sentence.
  const say = (status, p, second) => {
    const name = second ? 'second iPhone' : 'iPhone';
    if (!status) return ui.host?.stalled ? 'The output window is not drawing. Bring it back into view.' : 'Starting…';
    if (!p) return 'Starting…';
    if (p.signal === 'error') return p.error;
    if (p.phone === 'connected') return p.media === 'connected' ? 'Phone paired and streaming.' : 'Phone paired.';
    if (p.blocked) return `The ${name} can't reach this Mac: this Wi-Fi keeps devices apart. 1. iPhone: Settings → Personal Hotspot → on. 2. This Mac: choose the iPhone in the Wi-Fi menu. The phone then connects by itself.`;
    if (p.signal === 'open') return `Ready. Scan the code with the ${name}'s camera.`;
    if (p.signal === 'disconnected') return `Cannot reach the pairing server${p.error ? ` (${p.error})` : ''}; retrying. Public and guest Wi-Fi often block it: try the iPhone's Personal Hotspot, or Pair without internet. A phone that is already paired keeps working.`;
    return 'Connecting to the pairing server…';
  };
  const tabText = (name, p) => `${name} · ${p?.phone === 'connected' ? 'paired' : 'not paired'}`;

  function render(status) {
    // The Setup panel is about the first phone; the pop-over about the
    // phone its tab is on.
    state.textContent = say(status, status?.phone, false);
    const second = which === 'b';
    const p = second ? status?.phoneB : status?.phone;
    const kind = second ? 'phone2' : 'phone';
    popState.textContent = say(status, p, second);
    tabs.a.textContent = tabText('iPhone', status?.phone);
    tabs.b.textContent = store.state.net.second ? tabText('iPhone B', status?.phoneB) : 'iPhone B · add a second phone';

    const paired = p?.phone === 'connected';
    const video = paired && p.media === 'connected';
    // Long enough to read "Phone paired and streaming."
    if (forPairing && !pop.hidden && paired && !closeTimer) closeTimer = setTimeout(hidePop, video || p.info?.controllerOnly ? 1500 : 4000);
    if (!paired && closeTimer) {
      clearTimeout(closeTimer);
      closeTimer = 0;
    }
    // Either input may be showing this phone.
    const shown = [status?.input, status?.inputB].find((i) => i?.kind === kind);
    const steps = [
      [`Picture running${status ? (status.host?.role === 'output' ? ': in the output window' : ': on this page') : ''}`, !!status, 'Starting. If this stays, reload this page.'],
      [p?.direct && paired ? 'Paired without the pairing server' : 'Mac reached the pairing server', p?.signal === 'open' || paired, p?.signal === 'error' ? 'Room code taken elsewhere.' : 'No answer yet. The network may block it: use Pair without internet.'],
      ['Phone found the Mac', paired, `Scan the code and tap START on the ${second ? 'second ' : ''}phone. If the phone says "Mac not found", the code is wrong or stale.`],
      [`Video link${video && p.route ? `: ${p.route}` : ''}`, video, p?.info?.controllerOnly ? 'The phone\'s camera is off (controller only).' : 'Phone and Mac cannot reach each other directly on this network.'],
      ['Picture arriving', video && shown?.state === 'live', shown ? 'Connected, but no frames yet.' : `Select the ${second ? 'iPhone B input (key 2, or Shift + 2 for input B)' : 'iPhone input (key 1)'}.`],
    ];
    popSteps.replaceChildren();
    let failed = false;
    for (const [label, ok, help] of steps) {
      const state = ok ? 'done' : failed ? 'todo' : 'stuck';
      popSteps.append(el('li', { class: state }, [el('b', { text: ok ? 'OK' : failed ? '··' : 'HERE' }), el('span', { text: !ok && !failed ? `${label}. ${help}` : label })]));
      if (!ok) failed = true;
    }
  }
  ui.onStatus(render);

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
      el('div', { class: 'row' }, [el('button', { class: 'grow pair-offline', id: 'pair-offline', text: 'Pair without internet', title: PAIR_TIP, onclick: () => ui.pairOffline?.() })]),
      warn,
      el('div', { class: 'row' }, [el('span', { class: 'caps', text: 'Codec' }), codec.node]),
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
