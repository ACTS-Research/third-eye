import { el, readJSON, writeJSON } from '../shared/util.js';

const SCREEN_KEY = 'thirdeye.screen';
const WINDOW_NAME = 'third-eye-output';

export function mountOutputPanel(root, ui) {
  const { store, bus } = ui;
  const outputUrl = new URL('../output/', location.href).href;
  let screens = [];
  let chosen = readJSON(SCREEN_KEY, null);

  const select = el('select', { class: 'grow', onchange: () => choose(select.value) });
  const detect = el('button', { text: 'Find displays', onclick: () => loadScreens(true) });
  const hint = el('div', { class: 'dim small keep-3' });
  const openBtn = el('button', { class: 'primary grow', text: 'Open output window', onclick: open });
  const scale = el('select', {
    title: 'Render resolution',
    onchange: () => store.merge('globals', { renderScale: Number(scale.value) }),
  }, [
    el('option', { value: '1', text: 'Full res' }),
    el('option', { value: '0.75', text: '75%' }),
    el('option', { value: '0.5', text: '50%' }),
  ]);
  const previewBtn = el('button', {
    text: 'Monitor',
    title: 'Show a small copy of the output on this page',
    onclick: () => store.merge('globals', { preview: !store.state.globals.preview }),
  });

  function choose(index) {
    const s = screens[Number(index)];
    chosen = s ? { label: s.label, left: s.left, top: s.top } : null;
    writeJSON(SCREEN_KEY, chosen);
  }

  function renderScreens() {
    select.replaceChildren(el('option', { value: '', text: 'Display: place by hand' }));
    screens.forEach((s, i) => {
      const name = `${s.label || `Display ${i + 1}`} — ${s.width}×${s.height}${s.isPrimary ? ' (main)' : ''}`;
      select.append(el('option', { value: String(i), text: name }));
    });
    const match = screens.findIndex((s) => chosen && s.label === chosen.label && s.left === chosen.left && s.top === chosen.top);
    select.value = match >= 0 ? String(match) : '';
    // Default to the first non-primary display: that is the projector.
    if (match < 0 && !chosen) {
      const ext = screens.findIndex((s) => !s.isPrimary);
      if (ext >= 0) {
        select.value = String(ext);
        choose(ext);
      }
    }
  }

  async function loadScreens(prompt) {
    if (!('getScreenDetails' in window)) {
      hint.textContent = 'This browser cannot place windows on a chosen display. Drag the output window to the projector, then click it or press F.';
      detect.disabled = true;
      return;
    }
    try {
      if (!prompt) {
        const perm = await navigator.permissions.query({ name: 'window-management' });
        if (perm.state !== 'granted') {
          hint.textContent = 'Click "Find displays" to let the output open fullscreen on the projector.';
          return;
        }
      }
      const details = await window.getScreenDetails();
      const refresh = () => {
        screens = [...details.screens];
        renderScreens();
      };
      details.addEventListener('screenschange', refresh);
      refresh();
      hint.textContent = screens.length > 1 ? '' : 'Only one display found. Connect the projector and it will appear here.';
    } catch (err) {
      hint.textContent = 'Display access was denied. Drag the output window to the projector, then click it or press F.';
    }
  }

  function open() {
    const s = screens[Number(select.value)];
    const features = s
      ? `popup,left=${s.availLeft},top=${s.availTop},width=${s.availWidth},height=${s.availHeight}`
      : 'popup,width=1280,height=720';
    const win = window.open(outputUrl, WINDOW_NAME, features);
    if (!win) hint.textContent = 'The browser blocked the output window. Allow pop-ups for this site and try again.';
  }

  ui.openOutput = open;

  // Closes every output window in this browser (stray tabs included) and
  // opens one fresh one. The cure for "which window has the phone?".
  function restart() {
    bus.send('output', { cmd: 'close' });
    setTimeout(open, 500);
  }
  ui.restartOutput = restart;

  const sync = () => {
    const g = store.state.globals;
    scale.value = String(g.renderScale);
    previewBtn.classList.toggle('on', g.preview);
  };
  store.subscribe(sync);
  ui.onStatus((status) => {
    openBtn.textContent = status ? (status.fullscreen ? 'Output is fullscreen' : 'Output is open: click it or press F for fullscreen') : 'Open output window';
    openBtn.classList.toggle('primary', !status);
  });

  root.append(
    el('div', { class: 'panel' }, [
      el('h2', {}, ['Output', el('button', { class: 'icon', text: '↻', title: 'Reload the output window', onclick: () => bus.send('output', { cmd: 'reload' }) })]),
      el('div', { class: 'row' }, [openBtn]),
      el('div', { class: 'row' }, [el('button', { class: 'grow', id: 'restart-output', text: 'Close all output windows and open a new one', onclick: restart })]),
      el('div', { class: 'row' }, [select, detect]),
      el('div', { class: 'row' }, [scale, previewBtn]),
      hint,
    ]),
  );
  renderScreens();
  loadScreens(false);
  sync();
}
