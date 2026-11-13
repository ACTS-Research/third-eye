// The strip along the bottom of the perform screen. It shows either every
// preset (load, reorder, edit, and "+" to put one in the running order) or
// the running order itself: steps that point at presets, so one preset can
// come round as often as the show needs. With no steps there is no switch
// and the strip is the plain preset strip.

import { runAction } from '../shared/actions.js';
import { MAX_FADE, MAX_NOTE, applyPreset, applyStep } from '../shared/presets.js';
import { el, readJSON, writeJSON } from '../shared/util.js';

const VIEW_KEY = 'thirdeye.strip.view';

export function mountStrip(ui, onBuilt) {
  const { store, presets } = ui;
  const tiles = el('div', { class: 'tiles' });
  // Which list was last asked for. The running order is only ever shown
  // when it has steps.
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
        title: 'Takes this step out of the running order. The preset is kept.',
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
        tool('add', '+', `Add preset ${i + 1}, ${p.name}, to the running order`, 'Add to the end of the running order', () => {
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
        tool('remove', '×', `Remove step ${i + 1}, ${s.name}, from the running order`, 'Remove this step. The preset is kept.', () => presets.removeStep(i)),
      ]),
    ]);
    draggable(tile, i, (from, to) => presets.moveStep(from, to));
    return tile;
  }

  // What Next will do, in words.
  function describe(order) {
    if (!order.steps.length) return 'Click to load, drag to reorder. + adds a preset to the running order.';
    if (order.off) return `Off the list on ${presets.list[presets.current]?.name ?? 'an unsaved look'}. Next returns to step ${order.cue + 1}.`;
    if (order.cue < 0) return `Not started. Next loads step 1, ${order.steps[0].name}.`;
    if (order.next < 0) return 'Last step.';
    const s = order.steps[order.next];
    return `Next: ${order.next + 1} ${s.name}${s.note ? ` · ${s.note}` : ''}`;
  }

  const heading = el('span', { class: 'caps', text: 'Presets' });
  const showOrder = el('button', { id: 'strip-order', onclick: () => setView('order') });
  const showAll = el('button', { id: 'strip-all', text: 'All presets', onclick: () => setView('all') });
  const status = el('span', { class: 'dim small', id: 'strip-status', style: 'margin-left:auto;text-align:right', role: 'status' });

  function build() {
    const order = presets.order;
    const count = order.steps.length;
    const mode = count && view !== 'all' ? 'order' : 'all';
    tiles.replaceChildren();
    if (mode === 'order') {
      order.steps.forEach((s, i) => tiles.append(stepTile(s, i, order)));
      tiles.append(el('div', { class: 'tile new' }, [el('button', { class: 'load', text: 'Add steps', title: 'Shows every preset; + adds one to the running order', onclick: () => setView('all') })]));
    } else {
      presets.list.forEach((p, i) => tiles.append(presetTile(p, i)));
      tiles.append(
        el('div', { class: 'tile new' }, [
          el('button', { class: 'load', text: 'Save as new preset', title: 'Keeps what is live now as a new preset', onclick: () => ui.editPreset(presets.addFromLive()) }),
        ]),
      );
    }
    strip.dataset.view = mode;
    heading.hidden = count > 0;
    showOrder.hidden = showAll.hidden = !count;
    showOrder.textContent = `Running order · ${count}`;
    showOrder.setAttribute('aria-pressed', String(mode === 'order'));
    showAll.setAttribute('aria-pressed', String(mode === 'all'));
    status.textContent = describe(order);
    // The step being edited may have moved or gone.
    if (dialog.open && !order.steps[editing]) dialog.close();
    onBuilt?.();
    ui.midiMap?.refresh();
  }

  const strip = el('footer', { class: 'strip', 'aria-label': 'Presets and running order' }, [
    el('div', { class: 'strip-head' }, [
      heading,
      showOrder,
      showAll,
      el('button', { 'data-midi': 'presetPrev', onclick: () => runAction(store, 'presetPrev') }, ['[ Prev']),
      el('button', { 'data-midi': 'presetNext', onclick: () => runAction(store, 'presetNext') }, ['Next ]']),
      status,
    ]),
    tiles,
    dialog,
  ]);

  presets.onChange(build);
  return { root: strip, build };
}
