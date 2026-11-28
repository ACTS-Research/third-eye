// The strip along the bottom of the perform screen. It shows either every
// preset (load, reorder, edit, and "+" to put one in the live show) or the
// live show's steps: steps that point at presets, so one preset can come
// round as often as the show needs. Under the tiles, the Show menu chooses
// the live show and makes, renames, saves and opens shows (mock-up S1b,
// design/shows/). A show with no steps shows every preset.

import { runAction } from '../shared/actions.js';
import { MAX_FADE, MAX_NOTE, applyPreset, applyStep, exportShow, parseShowFile, showFileName } from '../shared/presets.js';
import { el, readJSON, writeJSON } from '../shared/util.js';
import { menu } from './controls.js';

const VIEW_KEY = 'thirdeye.strip.view';

export function mountStrip(ui, onBuilt) {
  const { store, presets } = ui;
  const tiles = el('div', { class: 'tiles' });
  // Which list was last asked for. The show's steps are only ever shown
  // when it has some.
  let view = readJSON(VIEW_KEY, 'order') === 'all' ? 'all' : 'order';
  const setView = (next) => {
    view = next;
    writeJSON(VIEW_KEY, view);
    build();
  };

  // Tiles of either list are dragged into place the same way.
  let dragFrom = -1;
  function draggable(tile, i, move) {
    tile.draggable = true;
    tile.addEventListener('dragstart', (e) => {
      dragFrom = i;
      tile.classList.add('dragging');
      e.dataTransfer.effectAllowed = 'move';
      e.dataTransfer.setData('text/plain', String(i));
    });
    tile.addEventListener('dragend', () => {
      dragFrom = -1;
      for (const t of tiles.children) t.classList.remove('dragging', 'drop-here');
    });
    tile.addEventListener('dragover', (e) => {
      if (dragFrom < 0) return;
      e.preventDefault();
      tile.classList.toggle('drop-here', dragFrom !== i);
    });
    tile.addEventListener('dragleave', () => tile.classList.remove('drop-here'));
    tile.addEventListener('drop', (e) => {
      e.preventDefault();
      if (dragFrom >= 0) move(dragFrom, i);
    });
  }

  // ------------------------------------------------- one step's details ---
  let editing = -1;
  const stepTitle = el('h2');
  const note = el('input', {
    type: 'text',
    id: 'step-note',
    maxLength: MAX_NOTE,
    placeholder: 'What happens here',
    oninput: () => presets.updateStep(editing, { note: note.value }),
  });
  const fade = el('input', {
    type: 'number',
    id: 'step-fade',
    min: '0',
    max: String(MAX_FADE),
    step: '0.1',
    onchange: () => {
      const v = fade.value.trim() === '' ? NaN : Number(fade.value);
      presets.updateStep(editing, { fade: Number.isFinite(v) ? Math.min(MAX_FADE, Math.max(0, v)) : null });
    },
  });
  const dialog = el('dialog', { id: 'step-dialog', 'aria-labelledby': 'step-title' }, [
    Object.assign(stepTitle, { id: 'step-title' }),
    el('div', { class: 'row' }, [el('label', { for: 'step-note', text: 'Note' }), Object.assign(note, { className: 'grow' })]),
    el('div', { class: 'row' }, [el('label', { for: 'step-fade', text: 'Fade in' }), fade, el('span', { text: 's' }), el('span', { class: 'dim small', text: "Blank uses the preset's own." })]),
    el('div', { class: 'row' }, [
      el('button', {
        text: 'Edit preset',
        title: 'Opens the preset this step uses. Changes show in every step that uses it.',
        onclick: () => {
          const step = presets.order.steps[editing];
          dialog.close();
          if (step) ui.editPreset(step.index);
        },
      }),
      el('button', {
        text: 'Remove step',
        title: 'Takes this step out of the show. The preset is kept.',
        onclick: () => {
          const i = editing;
          dialog.close();
          presets.removeStep(i);
        },
      }),
      el('span', { class: 'grow' }),
      el('button', { class: 'primary', text: 'Done', onclick: () => dialog.close() }),
    ]),
  ]);
  dialog.addEventListener('close', () => {
    editing = -1;
  });
  function openStep(i) {
    const step = presets.order.steps[i];
    if (!step) return;
    editing = i;
    stepTitle.textContent = `Step ${i + 1} · ${step.name}`;
    note.value = step.note;
    fade.value = step.fade === null ? '' : String(step.fade);
    fade.placeholder = (presets.list[step.index].fade ?? store.state.globals.fadeTime).toFixed(1);
    dialog.showModal();
    note.focus();
  }

  // -------------------------------------------------------------- tiles ---
  const tool = (cls, text, label, title, onclick) => el('button', { class: cls, text, 'aria-label': label, title, onclick });

  function presetTile(p, i) {
    const seconds = p.fade ?? store.state.globals.fadeTime;
    const tile = el('div', { class: `tile${i === presets.current ? ' on' : ''}`, 'data-index': String(i) }, [
      el('button', { class: 'load', 'data-midi': `preset:${i}`, title: `Load with a ${seconds.toFixed(1)} s fade. Drag to reorder.`, onclick: () => applyPreset(store, i) }, [
        el('span', { class: 'num', text: String(i + 1) }),
        el('span', { class: 'name', text: p.name }),
      ]),
      el('div', { class: 'tools' }, [
        tool('add', '+', `Add preset ${i + 1}, ${p.name}, to the show`, 'Add to the end of the show', () => {
          // Stay here: one preset is rarely the only one to add.
          view = 'all';
          writeJSON(VIEW_KEY, view);
          presets.addStep(i);
        }),
        tool('edit', 'Edit', `Edit preset ${i + 1}, ${p.name}`, null, () => ui.editPreset(i)),
      ]),
    ]);
    draggable(tile, i, (from, to) => presets.move(from, to));
    return tile;
  }

  function stepTile(s, i, order) {
    const next = i === order.next;
    const seconds = s.fade ?? presets.list[s.index].fade ?? store.state.globals.fadeTime;
    const tile = el('div', { class: `tile step${i === order.live ? ' on' : ''}${next ? ' next' : ''}`, 'data-index': String(i) }, [
      el('button', { class: 'load', 'data-midi': `step:${i}`, title: `Load with a ${seconds.toFixed(1)} s fade. Drag to reorder.`, onclick: () => applyStep(store, i) }, [
        el('span', { class: 'num', text: String(i + 1) }),
        el('span', { class: 'foot' }, [
          next && el('span', { class: 'tag', text: order.off ? 'Return' : 'Next' }),
          el('span', { class: 'name', text: s.name }),
          s.note && el('span', { class: 'note', text: s.note }),
        ]),
      ]),
      el('div', { class: 'tools' }, [
        tool('note-edit', 'Note', `Note and fade for step ${i + 1}, ${s.name}`, 'Note and fade for this step', () => openStep(i)),
        tool('remove', '×', `Remove step ${i + 1}, ${s.name}, from the show`, 'Remove this step. The preset is kept.', () => presets.removeStep(i)),
      ]),
    ]);
    draggable(tile, i, (from, to) => presets.moveStep(from, to));
    return tile;
  }

  // What Next will do, in words.
  function describe(order) {
    if (!order.steps.length) return 'Click to load, drag to reorder. + adds a preset to the show.';
    if (order.off) return `Off the list on ${presets.list[presets.current]?.name ?? 'an unsaved look'}. Next returns to step ${order.cue + 1}.`;
    if (order.cue < 0) return `Not started. Next loads step 1, ${order.steps[0].name}.`;
    if (order.next < 0) return 'Last step.';
    const s = order.steps[order.next];
    return `Next: ${order.next + 1} ${s.name}${s.note ? ` · ${s.note}` : ''}`;
  }

  const showOrder = el('button', { id: 'strip-order', onclick: () => setView('order') });
  const showAll = el('button', { id: 'strip-all', text: 'All presets', onclick: () => setView('all') });

  // ------------------------------------------------------------ shows ---
  const showNote = el('span', { class: 'dim small', id: 'show-note', role: 'status' });
  const say = (text) => {
    showNote.textContent = text;
  };
  function saveShowFile() {
    const show = presets.live;
    const blob = new Blob([exportShow(show, presets.list)], { type: 'application/json' });
    const a = el('a', { href: URL.createObjectURL(blob), download: showFileName(show.name) });
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
    say(`Saved ${showFileName(show.name)} to Downloads.`);
  }
  const showPicker = el('input', {
    type: 'file',
    id: 'show-file',
    accept: 'application/json,.json',
    style: 'display:none',
    onchange: async () => {
      const file = showPicker.files[0];
      showPicker.value = '';
      if (!file) return;
      try {
        const incoming = parseShowFile(await file.text());
        // Presets already here (the same preset, by its identity) are used as
        // they are; where the file's differs, ask once which to keep.
        const same = (a, b) => JSON.stringify([a.name, a.fade, a.scene]) === JSON.stringify([b.name, b.fade, b.scene]);
        const differ = incoming.presets.filter((p) => presets.list.some((q) => q.id === p.id && !same(p, q)));
        const fresh = incoming.presets.filter((p) => !presets.list.some((q) => q.id === p.id));
        const take = differ.length > 0 && confirm(`${differ.length === 1 ? 'A preset' : `${differ.length} presets`} in this show (${differ.map((p) => p.name).join(', ')}) ${differ.length === 1 ? 'is' : 'are'} also in your list, changed. OK takes the file's; Cancel keeps yours.`);
        presets.mergePresets(incoming.presets, take);
        const show = presets.addShow(incoming);
        // (A file with no MIDI controls in it has taken on the live show's.)
        const midi = incoming.midi ? `, ${incoming.midi.length ? `its own MIDI controls (${incoming.midi.length})` : 'no MIDI controls'}` : '';
        say(`Opened ${show.name}: ${show.steps.length} step${show.steps.length === 1 ? '' : 's'}${fresh.length ? `, ${fresh.length} new preset${fresh.length === 1 ? '' : 's'} at the end of the list` : ''}${midi}.`);
      } catch (err) {
        say(`Could not open it: ${err.message}`);
      }
    },
  });
  const showMenu = menu({
    action: true,
    id: 'show-menu',
    label: 'Shows',
    text: 'Show',
    mark: () => `show:${presets.live.id}`,
    options: () => [
      ...presets.shows.map((x) => ({ value: `show:${x.id}`, label: x.name, group: 'Shows' })),
      { value: 'new', label: '+ New show', group: 'This show' },
      { value: 'rename', label: 'Rename…', group: 'This show' },
      { value: 'duplicate', label: 'Duplicate', group: 'This show' },
      { value: 'delete', label: presets.shows.length > 1 ? 'Delete…' : 'Empty it…', group: 'This show' },
      // Its MIDI controls are set, copied and cleared in MIDI map.
      { value: 'midi', label: 'MIDI controls…', group: 'This show' },
      { value: 'save', label: 'Save show to a file…', group: 'Files' },
      { value: 'open', label: 'Open a show file…', group: 'Files' },
    ],
    onChange: (v) => {
      const show = presets.live;
      if (v.startsWith('show:')) presets.makeLive(v.slice(5));
      else if (v === 'new') {
        const name = prompt('Name of the new show', 'New show');
        if (name !== null) presets.newShow(name || 'New show');
      } else if (v === 'rename') {
        const name = prompt('Rename the show', show.name);
        if (name) presets.renameShow(show.id, name);
      } else if (v === 'duplicate') presets.duplicateShow(show.id);
      else if (v === 'delete') {
        const last = presets.shows.length === 1;
        if (confirm(last ? `Take every step out of ${show.name}? (It is your only show.) The presets are kept.` : `Delete the show ${show.name}? The presets are kept.`)) presets.deleteShow(show.id);
      } else if (v === 'midi') ui.midiMap?.open();
      else if (v === 'save') saveShowFile();
      else if (v === 'open') showPicker.click();
    },
  });
  showMenu.node.classList.add('show-menu');
  const saveShow = el('button', { class: 'link', id: 'save-show', text: 'Save show to a file…', onclick: saveShowFile });
  const status = el('span', { class: 'dim small', id: 'strip-status', style: 'margin-left:auto;text-align:right', role: 'status' });

  function build() {
    const order = presets.order;
    const count = order.steps.length;
    const mode = count && view !== 'all' ? 'order' : 'all';
    tiles.replaceChildren();
    if (mode === 'order') {
      order.steps.forEach((s, i) => tiles.append(stepTile(s, i, order)));
      tiles.append(el('div', { class: 'tile new' }, [el('button', { class: 'load', text: 'Add steps', title: 'Shows every preset; + adds one to the show', onclick: () => setView('all') })]));
    } else {
      presets.list.forEach((p, i) => tiles.append(presetTile(p, i)));
      tiles.append(
        el('div', { class: 'tile new' }, [
          el('button', { class: 'load', text: 'Save as new preset', title: 'Keeps what is live now as a new preset', onclick: () => ui.editPreset(presets.addFromLive()) }),
        ]),
      );
    }
    strip.dataset.view = mode;
    const live = presets.live;
    showOrder.textContent = live.name;
    showOrder.disabled = !count;
    showOrder.title = count ? 'The steps of this show' : 'This show has no steps yet: + on a preset adds one';
    showMenu.node.querySelector('.menu-text').textContent = `Show: ${live.name}`;
    showOrder.setAttribute('aria-pressed', String(mode === 'order'));
    showAll.setAttribute('aria-pressed', String(mode === 'all'));
    status.textContent = describe(order);
    // The step being edited may have moved or gone.
    if (dialog.open && !order.steps[editing]) dialog.close();
    onBuilt?.();
    ui.midiMap?.refresh();
  }

  const strip = el('footer', { class: 'strip', 'aria-label': 'Presets and shows' }, [
    el('div', { class: 'strip-head' }, [
      showOrder,
      showAll,
      el('button', { 'data-midi': 'presetPrev', onclick: () => runAction(store, 'presetPrev') }, ['[ Prev']),
      el('button', { 'data-midi': 'presetNext', onclick: () => runAction(store, 'presetNext') }, ['Next ]']),
      status,
    ]),
    tiles,
    el('div', { class: 'strip-foot' }, [showMenu.node, saveShow, showNote, showPicker]),
    dialog,
  ]);

  presets.onChange(build);
  return { root: strip, build };
}
