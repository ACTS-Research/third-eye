// Preset file handling, the default fade, and where the live show is backed
// up, on the setup screen.

import { exportPresets, missingFactory, parsePresetFile, resetPresets, savePresets } from '../shared/presets.js';
import { el } from '../shared/util.js';
import { bar } from './controls.js';

export function mountLibraryPanel(root, ui) {
  const { store, presets } = ui;
  const note = el('div', { class: 'dim small keep-1', id: 'library-note' });
  const fade = bar({ label: 'Default fade', min: 0, max: 10, step: 0.1, value: store.state.globals.fadeTime, reset: 2, unit: ' s', onInput: (v) => store.merge('globals', { fadeTime: v }) });

  const picker = el('input', {
    type: 'file',
    accept: 'application/json,.json',
    style: 'display:none',
    onchange: async () => {
      const file = picker.files[0];
      picker.value = '';
      if (!file) return;
      try {
        const { presets: incoming, shows } = parsePresetFile(await file.text());
        presets.append(incoming);
        // Its shows are added beside yours; none replaces one, none goes live.
        const added = shows.map((x) => presets.addShow(x, false).name);
        note.textContent = `Imported ${incoming.length} preset${incoming.length === 1 ? '' : 's'}, at the end of the strip.${added.length ? ` Shows added: ${added.join(', ')} (in the Show menu).` : ''}`;
      } catch (err) {
        note.textContent = `Could not import: ${err.message}`;
      }
    },
  });

  function download() {
    const blob = new Blob([exportPresets(presets.list, presets.showData)], { type: 'application/json' });
    const a = el('a', { href: URL.createObjectURL(blob), download: 'third-eye-presets.json' });
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  }

  // ------------------------------------------------- the show backup ---
  const { backup } = ui;
  const backupText = el('div', { class: 'small keep-2', id: 'backup-state' });
  const chooseFolder = el('button', { id: 'backup-choose', onclick: () => backup.choose() });
  const allowFolder = el('button', { id: 'backup-allow', class: 'primary', text: 'Allow', title: 'Chrome asks once a session before the page may write to the folder', onclick: () => backup.allow() });
  const forgetFolder = el('button', { id: 'backup-forget', text: 'Stop backing up', onclick: () => backup.forget() });
  const time = (t) => new Date(t).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  function syncBackup() {
    const b = backup;
    chooseFolder.textContent = b.folder ? 'Choose another folder…' : 'Choose a backup folder…';
    chooseFolder.hidden = b.state === 'unsupported';
    allowFolder.hidden = b.state !== 'ask';
    forgetFolder.hidden = !b.folder;
    backupText.textContent =
      b.state === 'unsupported'
        ? 'This browser cannot keep files in a folder: save shows from the Show menu instead (Chrome can).'
        : b.state === 'none'
          ? 'Shows are not backed up yet. Choose a folder once; the live show is then kept there, one file per show, rewritten when it changes.'
          : b.state === 'ask'
            ? `Chrome needs your OK before writing to ${b.folder} again this session.${b.pending ? ' A change is waiting.' : ''}`
            : b.state === 'error'
              ? `Could not write to ${b.folder}: ${b.error}. Choose the folder again.`
              : `Backing up to ${b.folder}.${b.savedAt ? ` Last saved ${time(b.savedAt)}: ${b.savedName}.` : ''}${b.pending ? ' A change will be saved shortly.' : ''}`;
    ui.setAlert?.('backup', b.state === 'ask' && b.pending ? `Show backups are waiting: Chrome needs your OK to write to ${b.folder}.` : b.state === 'error' ? `Show backup failed: ${b.error}` : null, 'warn', ui.alertTo?.panel('library-panel', 'Go to Preset library'));
  }
  backup.onChange(syncBackup);

  const sync = () => {
    fade.set(store.state.globals.fadeTime);
  };
  store.subscribe((op) => {
    if (op.op === 'replace' || (op.op === 'merge' && op.key === 'globals')) sync();
  });

  root.append(
    el('div', { class: 'panel', id: 'library-panel' }, [
      el('h2', { text: 'Preset library' }),
      el('div', { class: 'row wrap' }, [
        el('button', { text: 'Export presets', onclick: download }),
        el('button', { text: 'Import presets', onclick: () => picker.click() }),
        el('button', {
          text: 'Bring back deleted factory presets',
          title: 'Adds any factory preset that is no longer in your list, as it was made. Nothing of yours is changed.',
          onclick: () => {
            const missing = missingFactory(presets.list);
            if (missing.length) {
              savePresets([...presets.list, ...missing]);
              presets.reload();
            }
            note.textContent = missing.length ? `Added at the end: ${missing.map((p) => p.name).join(', ')}.` : 'Every factory preset is already in your list.';
          },
        }),
        el('button', {
          text: 'Restore factory set',
          onclick: () => {
            if (!confirm('Replace every preset with the factory set? Every show is cleared too.')) return;
            resetPresets();
            presets.reload();
            store.dispatch({ op: 'presetIndex', index: -1 });
            store.merge('order', { cue: -1, off: false });
            note.textContent = 'Factory presets restored.';
          },
        }),
        picker,
      ]),
      el('div', { class: 'row' }, [el('span', { class: 'caps', text: 'Default fade' }), fade.node]),
      el('h2', { text: 'Show backup' }),
      el('div', { class: 'row wrap' }, [chooseFolder, allowFolder, forgetFolder]),
      backupText,
      el('div', { class: 'dim small', text: 'Used by presets that have no fade time of their own. Name, fade and order are set per preset: use Edit on a preset, and drag tiles on the perform screen.' }),
      note,
    ]),
  );
  sync();
  syncBackup();
}
