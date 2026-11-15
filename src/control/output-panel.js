import { el, readJSON, writeJSON } from '../shared/util.js';
import { menu } from './controls.js';

const SCREEN_KEY = 'thirdeye.screen';
const WINDOW_NAME = 'third-eye-output';

export function mountOutputPanel(root, ui) {
  const { store, bus } = ui;
  const outputUrl = new URL('../output/', location.href).href;
  let screens = [];
  let chosen = readJSON(SCREEN_KEY, null);

  const screenName = (s, i) => `${s.label || `Display ${i + 1}`} — ${s.width}×${s.height}${s.isPrimary ? ' (main)' : ''}`;
  const select = menu({
    label: 'Which display the output window opens on',
    cls: 'grow',
    options: () => [{ value: '', label: 'Display: place by hand' }, ...screens.map((s, i) => ({ value: String(i), label: screenName(s, i) }))],
    value: '',
    onChange: (v) => choose(v),
  });
  const detect = el('button', { text: 'Find displays', onclick: () => loadScreens(true) });
  const hint = el('div', { class: 'dim small keep-3' });
  const note = el('div', { class: 'dim small keep-4', id: 'output-note' });
  const openBtn = el('button', { class: 'primary grow', text: 'Open output window', onclick: open });
  const scale = menu({
    label: 'Render resolution',
    options: [
      { value: 1, label: 'Full res' },
      { value: 0.75, label: '75%' },
      { value: 0.5, label: '50%' },
    ],
    value: store.state.globals.renderScale,
    onChange: (v) => store.merge('globals', { renderScale: v }),
  });
  scale.node.title = 'Render resolution';
  const previewBtn = el('button', {
    text: 'Monitor',
    title: 'Show a small copy of the output window\'s picture on this page',
    onclick: () => store.merge('globals', { preview: !store.state.globals.preview }),
  });

  function choose(index) {
    const s = screens[Number(index)];
    chosen = s ? { label: s.label, left: s.left, top: s.top } : null;
    writeJSON(SCREEN_KEY, chosen);
  }

  function renderScreens() {
    const match = screens.findIndex((s) => chosen && s.label === chosen.label && s.left === chosen.left && s.top === chosen.top);
    select.set(match >= 0 ? String(match) : '');
    // Default to the first non-primary display: that is the projector.
    if (match < 0 && !chosen) {
      const ext = screens.findIndex((s) => !s.isPrimary);
      if (ext >= 0) {
        select.set(String(ext));
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
    scale.set(g.renderScale);
    previewBtn.classList.toggle('on', g.preview);
  };
  store.subscribe(sync);
  ui.onStatus((status) => {
    const open = status?.host?.role === 'output';
    openBtn.textContent = open ? (status.fullscreen ? 'Output is fullscreen' : 'Output is open: click it or press F for fullscreen') : 'Open output window';
    openBtn.classList.toggle('primary', !open);
    note.textContent = open
      ? 'The picture is drawn in the output window. Close it and the picture returns to this page; the phone reconnects in a few seconds.'
      : 'Optional: for a projector or second screen. Until then the picture runs on this page. Opening it reconnects the phone (a few seconds) and stops a recording.';
  });

  root.append(
    el('div', { class: 'panel', id: 'output-panel' }, [
      el('h2', {}, ['Output', el('button', { class: 'icon', text: '↻', title: 'Reload the output window', onclick: () => bus.send('output', { cmd: 'reload' }) })]),
      el('div', { class: 'row' }, [openBtn]),
      note,
      el('div', { class: 'row' }, [el('button', { class: 'grow', id: 'restart-output', text: 'Close all output windows and open a new one', onclick: restart })]),
      el('div', { class: 'row' }, [select.node, detect]),
      el('div', { class: 'row' }, [scale.node, previewBtn]),
      hint,
    ]),
  );
  renderScreens();
  loadScreens(false);
  sync();
}
