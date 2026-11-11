// Modulation: source meters, source -> parameter mappings, trigger -> action
// bindings and the LFOs.

import { Pane } from 'tweakpane';
import { ACTIONS, TOGGLE_ACTIONS } from '../shared/actions.js';
import { EFFECT_BY_ID } from '../effects/index.js';
import { LFO_SHAPES, SOURCES, describeSource, sourceLabel } from '../shared/sources.js';
import { makeActionBinding, makeMapping, sceneOf } from '../shared/state.js';
import { el } from '../shared/util.js';

export function mountModPanel(root, ui) {
  const { store, bus } = ui;
  // Sources seen at run time (MIDI controls) join the static catalog.
  const dynamic = new Set();
  ui.knownSources = () => [...SOURCES.map((s) => s.id), ...dynamic];

  const sourceOptions = () => Object.fromEntries(ui.knownSources().map((id) => [sourceLabel(id), id]));

  function targetOptions() {
    const out = {};
    store.state.chain.forEach((item, i) => {
      const def = EFFECT_BY_ID[item.type];
      out[`${i + 1} ${def.name} · wet / dry`] = `${item.uid}:mix`;
      for (const key of Object.keys(def.params)) out[`${i + 1} ${def.name} · ${def.params[key].label ?? key}`] = `${item.uid}:${key}`;
    });
    return out;
  }

  function targetLabel(m) {
    const i = store.state.chain.findIndex((it) => it.uid === m.fx);
    if (i < 0) return '?';
    const def = EFFECT_BY_ID[store.state.chain[i].type];
    return `${i + 1} ${def.name} · ${m.key === 'mix' ? 'wet / dry' : m.key}`;
  }

  // ------------------------------------------------------------ mappings --
  const mapHost = el('div', { class: 'tp-host' });
  const mapNote = el('div', { class: 'dim small' });
  let mapPane = null;
  let openMapping = null;

  function mutateScene(fn) {
    const scene = sceneOf(store.state);
    fn(scene);
    store.setScene(scene);
  }

  function addMapping(source, overrides) {
    const chain = store.state.chain;
    if (!chain.length) {
      mapNote.textContent = 'Add an effect first.';
      return null;
    }
    // Aim at the parameter touched last, else the first one in the chain.
    const touched = ui.lastTouched && store.findEffect(ui.lastTouched.uid) ? ui.lastTouched : null;
    const fx = touched?.uid ?? chain[0].uid;
    const key = touched?.key ?? Object.keys(EFFECT_BY_ID[chain[0].type].params)[0];
    const mapping = makeMapping(source ?? 'pad.x', fx, key, overrides);
    openMapping = mapping.id;
    mutateScene((scene) => scene.mappings.push(mapping));
    return mapping;
  }
  ui.addMapping = addMapping;

  function buildMappings() {
    mapPane?.dispose();
    mapPane = new Pane({ container: mapHost });
    const mappings = store.state.mappings;
    mapNote.textContent = mappings.length ? '' : 'No mappings. Touch a parameter, then add one: it will target that parameter.';
    const sources = sourceOptions();
    const targets = targetOptions();
    for (const m of mappings) {
      const title = () => `${sourceLabel(m.source)}  →  ${targetLabel(m)}`;
      const folder = mapPane.addFolder({ title: title(), expanded: m.id === openMapping });
      const model = { source: m.source, target: `${m.fx}:${m.key}`, amount: m.amount, offset: m.offset, smooth: m.smooth, invert: m.invert, mode: m.mode, enabled: m.enabled };
      if (!(m.source in SOURCES_INDEX) && !Object.values(sources).includes(m.source)) sources[sourceLabel(m.source)] = m.source;
      const patch = (p) => store.patchItem('mappings', m.id, p);
      folder.addBinding(model, 'source', { options: sources }).on('change', (ev) => {
        patch({ source: ev.value });
        folder.title = title();
      });
      folder.addBinding(model, 'target', { options: targets }).on('change', (ev) => {
        const [fx, key] = ev.value.split(':');
        patch({ fx, key });
        folder.title = title();
      });
      folder.addBinding(model, 'amount', { min: -1, max: 1, step: 0.01 }).on('change', (ev) => patch({ amount: ev.value }));
      folder.addBinding(model, 'offset', { min: -1, max: 1, step: 0.01 }).on('change', (ev) => patch({ offset: ev.value }));
      folder.addBinding(model, 'smooth', { label: 'smoothing s', min: 0, max: 2, step: 0.01 }).on('change', (ev) => patch({ smooth: ev.value }));
      folder.addBinding(model, 'invert').on('change', (ev) => patch({ invert: ev.value }));
      folder.addBinding(model, 'mode', { options: { 'Add to the dialled value': 'add', 'Replace the value': 'set' } }).on('change', (ev) => patch({ mode: ev.value }));
      folder.addBinding(model, 'enabled').on('change', (ev) => patch({ enabled: ev.value }));
      folder.addButton({ title: 'Remove mapping' }).on('click', () => mutateScene((scene) => {
        scene.mappings = scene.mappings.filter((x) => x.id !== m.id);
      }));
      folder.on('fold', (ev) => {
        if (ev.expanded) openMapping = m.id;
        else if (openMapping === m.id) openMapping = null;
      });
    }
  }
  const SOURCES_INDEX = Object.fromEntries(SOURCES.map((s) => [s.id, true]));

  // ------------------------------------------------------------- actions --
  const actionList = el('div');

  const setActions = (list) => store.dispatch({ op: 'set', key: 'actions', value: list });

  function buildActions() {
    actionList.replaceChildren();
    const sources = sourceOptions();
    for (const b of store.state.actions) {
      const update = (patch) => setActions(store.state.actions.map((x) => (x.id === b.id ? { ...x, ...patch } : x)));
      const src = el('select', { onchange: () => update({ source: src.value }) }, Object.entries(sources).map(([label, id]) => el('option', { value: id, text: label })));
      if (![...src.options].some((o) => o.value === b.source)) src.append(el('option', { value: b.source, text: sourceLabel(b.source) }));
      src.value = b.source;
      const act = el('select', { onchange: () => update({ action: act.value }) }, Object.entries(ACTIONS).map(([id, label]) => el('option', { value: id, text: label })));
      act.value = b.action;
      const hold = el('input', { type: 'checkbox', checked: b.momentary, onchange: () => update({ momentary: hold.checked }) });
      const holdLabel = el('label', { title: 'On only while the trigger is held' }, [hold, 'hold']);
      holdLabel.style.visibility = TOGGLE_ACTIONS[b.action] ? 'visible' : 'hidden';
      actionList.append(
        el('div', { class: 'binding' }, [
          src,
          act,
          holdLabel,
          el('button', { class: 'icon', text: '✕', title: 'Remove', onclick: () => setActions(store.state.actions.filter((x) => x.id !== b.id)) }),
        ]),
      );
    }
    if (!store.state.actions.length) actionList.append(el('div', { class: 'dim small', text: 'No triggers. Any source rising past half fires its action.' }));
  }

  // ---------------------------------------------------------------- LFOs --
  const lfoHost = el('div', { class: 'tp-host' });
  let lfoPane = null;

  function buildLfos() {
    lfoPane?.dispose();
    lfoPane = new Pane({ container: lfoHost });
    store.state.lfos.forEach((lfo, i) => {
      const model = { shape: lfo.shape, rate: lfo.rate };
      const folder = lfoPane.addFolder({ title: `LFO ${i + 1}`, expanded: i === 0 });
      folder.addBinding(model, 'shape', { options: LFO_SHAPES }).on('change', (ev) => store.patchItem('lfos', lfo.id, { shape: ev.value }));
      folder.addBinding(model, 'rate', { label: 'rate Hz', min: 0.01, max: 10, step: 0.01 }).on('change', (ev) => store.patchItem('lfos', lfo.id, { rate: ev.value }));
    });
  }

  // -------------------------------------------------------------- meters --
  const meters = el('div', { class: 'meters' });
  const meterBars = new Map();

  function addMeter(id) {
    const s = describeSource(id);
    const fill = el('i');
    const bar = el('div', { class: `bar${s.bipolar ? ' bipolar' : ''}` }, [fill]);
    let title = meters.querySelector(`[data-group="${s.group}"]`);
    if (!title) {
      title = el('div', { class: 'group-title', 'data-group': s.group, text: s.group });
      meters.append(title);
    }
    // Keep each group together.
    let after = title;
    while (after.nextElementSibling && !after.nextElementSibling.classList.contains('group-title')) after = after.nextElementSibling;
    after.after(el('div', { class: 'meter', title: id }, [el('span', { text: s.label }), bar]));
    meterBars.set(id, { fill, bipolar: s.bipolar });
  }
  for (const s of SOURCES) if (!s.lazy) addMeter(s.id);

  bus.on('sources', (m) => {
    let grew = false;
    for (const [id, value] of Object.entries(m.values)) {
      let meter = meterBars.get(id);
      if (!meter) {
        // New at run time: a MIDI control (joins the source lists) or a
        // vision source whose feature was just switched on.
        if (!SOURCES_INDEX[id]) {
          dynamic.add(id);
          grew = true;
        }
        addMeter(id);
        meter = meterBars.get(id);
      }
      if (meter.bipolar) {
        const v = Math.max(-1, Math.min(1, value));
        meter.fill.style.left = `${v < 0 ? 50 + v * 50 : 50}%`;
        meter.fill.style.width = `${Math.abs(v) * 50}%`;
      } else {
        meter.fill.style.left = '0';
        meter.fill.style.width = `${Math.max(0, Math.min(1, value)) * 100}%`;
      }
    }
    if (grew) {
      buildMappings();
      buildActions();
    }
  });

  // -------------------------------------------------------------- layout --
  store.subscribe((op) => {
    if (op.op === 'scene' || op.op === 'replace') {
      buildMappings();
      buildLfos();
    }
    if (op.op === 'replace' || (op.op === 'set' && op.key === 'actions')) buildActions();
    if (op.op === 'item' && op.list === 'mappings' && op.patch && !('amount' in op.patch || 'offset' in op.patch || 'smooth' in op.patch)) {
      // Rare remote edit of a mapping's routing: cheapest to rebuild.
      if (store.lastRemote) buildMappings();
    }
  });

  root.append(
    el('div', { class: 'panel', id: 'mappings-panel' }, [
      el('h2', { text: 'Modulation' }),
      mapHost,
      mapNote,
      el('div', { class: 'row' }, [el('button', { class: 'primary', text: 'Add mapping', onclick: () => addMapping() })]),
    ]),
    el('div', { class: 'panel', id: 'actions-panel' }, [
      el('h2', { text: 'Triggers' }),
      actionList,
      el('div', { class: 'row' }, [el('button', { text: 'Add trigger', onclick: () => setActions([...store.state.actions, makeActionBinding('phone.shake', 'glitch')]) })]),
    ]),
    el('div', { class: 'panel', id: 'lfo-panel' }, [el('h2', { text: 'LFOs' }), lfoHost]),
    el('div', { class: 'panel', id: 'sources-panel' }, [el('h2', { text: 'Sources' }), meters]),
  );
  buildMappings();
  buildActions();
  buildLfos();
}
