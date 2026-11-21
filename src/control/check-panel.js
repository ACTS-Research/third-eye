// "Before the show": what can be checked from this page before an audience
// is watching. Each line is OK, CHECK (with what to do and a button that
// goes there) or YOU (something the page cannot see). A flag in the top bar
// counts the CHECK lines. The page also asks the Mac to stay awake while a
// phone is paired.

import { el } from '../shared/util.js';

export function mountCheckPanel(root, ui) {
  const { store } = ui;
  const list = el('div', { class: 'checks', id: 'checks' });
  const flag = el('button', { id: 'check-flag', class: 'check-flag', hidden: true, title: 'Before the show: something to look at', onclick: () => ui.goToPanel('check-panel') });
  document.getElementById('pills')?.append(flag);

  // The Mac must not sleep mid-show. Asked for while a phone is paired;
  // Chrome lets go of it whenever the page is hidden, so it is asked again
  // each time the page returns.
  let lock = null;
  let lockState = 'idle'; // idle | held | refused | unsupported
  async function keepAwake(want) {
    if (!('wakeLock' in navigator)) {
      lockState = 'unsupported';
      return;
    }
    if (!want) {
      lock?.release().catch(() => {});
      lock = null;
      lockState = 'idle';
      return;
    }
    if (lock || document.hidden) return;
    try {
      lock = await navigator.wakeLock.request('screen');
      lockState = 'held';
      lock.addEventListener('release', () => {
        lock = null;
        if (lockState === 'held') lockState = 'idle';
      });
    } catch {
      lockState = 'refused';
    }
  }
  document.addEventListener('visibilitychange', () => render(ui.status));

  const line = (mark, text, detail = '', fix = null) => {
    const row = el('div', { class: `check-row ${mark.toLowerCase()}` }, [
      el('b', { class: 'check-mark', text: mark }),
      el('span', {}, detail ? [el('b', { text: `${text} ` }), detail] : [text]),
    ]);
    if (fix) row.append(el('button', { class: 'check-fix', text: fix.label, onclick: fix.run }));
    return row;
  };

  function render(status) {
    const paired = [status?.phone, status?.phoneB].some((p) => p?.phone === 'connected');
    keepAwake(paired);
    const rows = [];
    const { input, globals } = store.state;

    if (lockState === 'refused' || lockState === 'unsupported') rows.push(line('CHECK', 'The Mac may go to sleep.', 'Chrome would not promise to keep it awake. In System Settings → Lock Screen, set the display to never turn off while on power.'));
    else rows.push(line('OK', paired ? 'The Mac will stay awake while a phone is paired' : 'The Mac will be kept awake once a phone is paired'));

    const p = status?.phone;
    if (!status) rows.push(line('CHECK', 'No picture is running.', 'Reload this page.'));
    else if (p.phone === 'connected') rows.push(line('OK', p.media === 'connected' ? `Phone paired and streaming${p.route ? ` · ${p.route}` : ''}` : 'Phone paired (controller only, or its video has not started)'));
    else rows.push(line('CHECK', 'No phone is paired.', 'Scan the code with the iPhone.', { label: 'Show the code', run: () => ui.togglePairing?.(document.getElementById('phone-pill')) }));

    if (status) {
      const where = status.host?.role === 'output' ? 'in the output window' : 'on this page';
      // Reported, not flagged: it dips while windows are being moved about.
      rows.push(line(status.renderFps >= 50 ? 'OK' : '··', `Picture drawing at ${Math.round(status.renderFps)} fps ${where}`));
    }

    if (input.dropA === 'hold') rows.push(line('CHECK', 'If the phone drops, the picture freezes.', 'Choose a stand-by under Input.', { label: 'Go to Input', run: () => ui.goToPanel('input-panel') }));
    else rows.push(line('OK', 'If the phone drops, the picture goes to its stand-by'));

    if (!globals.recAutoSave) rows.push(line('CHECK', 'Recordings will not save by themselves.', 'Saving to Downloads is switched off.', { label: 'Go to Recordings', run: () => ui.goToPanel('record-panel') }));
    else rows.push(line('OK', 'Recordings save to Downloads as they stop', '(if Chrome asks to allow several downloads, allow it)'));

    rows.push(line('YOU', 'Turn off Auto-Join for other Wi-Fi networks, so the Mac does not leave the hotspot mid-show.'));
    rows.push(line('YOU', 'Plug in the power. Close other tabs that use the camera or play video.'));
    list.replaceChildren(...rows);

    const n = rows.filter((r) => r.classList.contains('check')).length;
    // After the readouts, wherever they were added.
    if (flag.parentElement && flag.parentElement.lastElementChild !== flag) flag.parentElement.append(flag);
    flag.hidden = n === 0;
    flag.textContent = `Check ${n}`;
  }

  ui.onStatus(render);
  store.subscribe((op) => {
    if (op.op === 'replace' || op.op === 'merge') render(ui.status);
  });
  root.prepend(el('div', { class: 'panel', id: 'check-panel' }, [el('h2', { text: 'Before the show' }), list]));
  render(ui.status);
}
