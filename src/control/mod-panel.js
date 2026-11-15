// Modulation. On the edit screen's Modulation tab: one box for each mapping
// (a source moving a slider); on its LFOs tab, the four LFOs. On the setup screen: the
// triggers (source -> action) and a meter for every source.

import { ACTIONS, TOGGLE_ACTIONS, describeAction } from '../shared/actions.js';
import { MACRO_COUNT } from '../shared/macros.js';
import { EFFECT_BY_ID } from '../effects/index.js';
import { LFO_SHAPES, LFO_SYNC, SOURCES, describeSource, sourceLabel } from '../shared/sources.js';
import { INPUT_KINDS, makeActionBinding, makeMapping, sceneOf } from '../shared/state.js';
import { el } from '../shared/util.js';
import { bar, choice, menu, toggle } from './controls.js';

// One cycle of each LFO shape, drawn 32 by 16.
const SHAPE_PICTURES = {
  sine: '<path d="M1 8C5 -3 11 -3 16 8S27 19 31 8"/>',
  triangle: '<path d="M1 8L8.5 2L23.5 14L31 8"/>',
  saw: '<path d="M1 14L15 2V14L29 2V14"/>',
  square: '<path d="M1 13V3H11V13H21V3H31"/>',
  random: '<path d="M1 9H6V4H11V12H16V6H21V13H26V3H31"/>',
  drift: '<path d="M1 10C5 3 8 14 12 9S18 2 21 7S27 14 31 5"/>',
};
const SHAPE_ICONS = Object.entries(LFO_SHAPES).map(([label, value]) => ({ value, label, icon: SHAPE_PICTURES[value] ?? '' }));

// roots: { edit, setup } — mappings and LFOs belong to a preset (edit
// screen); triggers and the full source list are global (setup screen).
export function mountModPanel(roots, ui) {
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

  ui.targetOptions = targetOptions;

  // Everything a trigger (phone button, gesture, MIDI pad or knob) can drive.
  function actionOptions() {
    const out = { ...ACTIONS };
    for (const kind of INPUT_KINDS) out[`input:${kind}`] = describeAction(`input:${kind}`);
    (ui.presets?.list ?? []).forEach((p, i) => {
      out[`preset:${i}`] = `Preset ${i + 1}: ${p.name}`;
    });
    (ui.presets?.order.steps ?? []).forEach((step, i) => {
      out[`step:${i}`] = `Step ${i + 1}: ${step.name}`;
    });
    for (let i = 0; i < MACRO_COUNT; i++) out[`macro:${i}`] = `Fader ${i + 1} (continuous)`;
    return out;
  }

  function targetLabel(m) {
    const i = store.state.chain.findIndex((it) => it.uid === m.fx);
    if (i < 0) return '?';
    const def = EFFECT_BY_ID[store.state.chain[i].type];
    return `${i + 1} ${def.name} · ${m.key === 'mix' ? 'wet / dry' : def.params[m.key]?.label ?? m.key}`;
  }

  // ------------------------------------------------------------ mappings --
  // One box per mapping: one source moving one slider. A preset can have any
  // number, and a slider can be moved by more than one source.
  const mapList = el('div', { class: 'mod-list' });
  const mapNote = el('div', { class: 'dim small keep-1' });
  const moreOpen = new Set(); // mappings whose extra settings are showing
  let boxes = new Map(); // mapping id -> { node, fill, bipolar, source, bars }
  let highlight = null;

  function mutateScene(fn) {
    const scene = sceneOf(store.state);
    fn(scene);
    store.setScene(scene);
  }

  // The slider touched last, if it is still in the chain; else the first
  // slider of the effect that is open; else of the first effect.
  function defaultTarget() {
    const chain = store.state.chain;
    if (!chain.length) return null;
    const touched = ui.lastTouched && store.findEffect(ui.lastTouched.uid) ? ui.lastTouched : null;
    if (touched) return { fx: touched.uid, key: touched.key };
    return { fx: chain[0].uid, key: Object.keys(EFFECT_BY_ID[chain[0].type].params)[0] ?? 'mix' };
  }

  function addMapping(source, overrides, target = defaultTarget()) {
    if (!target) {
      mapNote.textContent = 'Add an effect first.';
      return null;
    }
    const mapping = makeMapping(source ?? 'lfo.1', target.fx, target.key, overrides);
    highlight = mapping.id;
    mutateScene((scene) => scene.mappings.push(mapping));
    return mapping;
  }
  ui.addMapping = addMapping;
  // The Mod button on a slider: shows what moves it, adding a source first
  // if nothing does.
  ui.openMod = (fx, key) => {
    const mine = store.state.mappings.find((m) => m.fx === fx && m.key === key);
    ui.setEditTab('mods');
    if (mine) {
      highlight = mine.id;
      buildMappings();
    } else {
      addMapping('lfo.1', undefined, { fx, key });
    }
    boxes.get(highlight)?.node.scrollIntoView({ block: 'nearest' });
  };

  // "Phone · Roll", but plain "LFO 1" where the name already says the group.
  const sourceName = (id) => {
    const s = describeSource(id);
    return s.label.startsWith(s.group) ? s.label : `${s.group} · ${s.label}`;
  };
  const sourceChoices = (m) => {
    const list = ui.knownSources().map((id) => {
      const s = describeSource(id);
      return { value: id, label: sourceName(id), item: s.label, group: s.group };
    });
    if (!list.some((o) => o.value === m.source)) list.push({ value: m.source, label: sourceName(m.source), item: describeSource(m.source).label, group: describeSource(m.source).group });
    return list;
  };
  const targetChoices = () => Object.entries(targetOptions()).map(([label, value]) => ({ value, label }));

  function buildMappings() {
    const mappings = store.state.mappings;
    boxes = new Map();
    mapList.replaceChildren();
    mapNote.textContent = mappings.length ? '' : store.state.chain.length ? 'Nothing moves by itself in this preset.' : 'Add an effect first.';
    for (const m of mappings) {
      const patch = (p) => store.patchItem('mappings', m.id, p);
      const live = () => store.state.mappings.find((x) => x.id === m.id) ?? m;
      const s = describeSource(m.source);
      const title = el('span', { class: 'mod-title', text: `${sourceName(m.source)} → ${targetLabel(m)}` });
      const fill = el('i');
      const on = toggle({ on: m.enabled, text: 'Off', onText: 'On', label: 'This modulation is on', onChange: (v) => patch({ enabled: v }) });
      const source = menu({ label: 'Source', options: () => sourceChoices(live()), value: m.source, onChange: (v) => patch({ source: v }) });
      const target = menu({
        label: 'Slider',
        options: targetChoices,
        value: `${m.fx}:${m.key}`,
        onChange: (v) => {
          const [fx, key] = v.split(':');
          patch({ fx, key });
        },
      });
      const amount = bar({ label: 'Amount', min: -1, max: 1, step: 0.01, value: m.amount, reset: 0.5, onInput: (v) => patch({ amount: v }) });
      const smooth = bar({ label: 'Smoothing', min: 0, max: 2, step: 0.01, value: m.smooth, reset: 0.08, unit: ' s', onInput: (v) => patch({ smooth: v }) });
      const offset = bar({ label: 'Offset', min: -1, max: 1, step: 0.01, value: m.offset, reset: 0, onInput: (v) => patch({ offset: v }) });
      const invert = toggle({ on: m.invert, text: 'Off', onText: 'On', label: 'Invert', onChange: (v) => patch({ invert: v }) });
      const mode = menu({ label: 'How it is applied', options: [{ value: 'add', label: 'Added to the dialled value' }, { value: 'set', label: 'Replaces the value' }], value: m.mode, onChange: (v) => patch({ mode: v }) });
      const extra = el('div', { class: 'mod-grid', hidden: !moreOpen.has(m.id) }, [
        el('span', { class: 'caps', text: 'Offset' }), offset.node,
        el('span', { class: 'caps', text: 'Invert' }), invert.node,
        el('span', { class: 'caps', text: 'Applied' }), mode.node,
      ]);
      const more = el('button', { class: 'mod-more', 'aria-expanded': String(moreOpen.has(m.id)), text: moreOpen.has(m.id) ? 'Less' : 'More', onclick: () => {
        if (moreOpen.has(m.id)) moreOpen.delete(m.id);
        else moreOpen.add(m.id);
        extra.hidden = !moreOpen.has(m.id);
        more.textContent = moreOpen.has(m.id) ? 'Less' : 'More';
        more.setAttribute('aria-expanded', String(moreOpen.has(m.id)));
      } });
      const node = el('div', { class: `mod${m.id === highlight ? ' open' : ''}${m.enabled ? '' : ' off'}`, 'data-id': m.id }, [
        el('div', { class: 'mod-head' }, [
          title,
          on.node,
          el('button', { class: 'icon', text: '✕', title: 'Remove this modulation', 'aria-label': `Remove: ${sourceName(m.source)} → ${targetLabel(m)}`, onclick: () => mutateScene((scene) => {
            scene.mappings = scene.mappings.filter((x) => x.id !== m.id);
          }) }),
        ]),
        el('div', { class: `mod-meter${s.bipolar ? ' bipolar' : ''}`, title: 'What the source is doing now' }, [fill]),
        el('div', { class: 'mod-route' }, [source.node, el('span', { 'aria-hidden': 'true', text: '→' }), target.node]),
        el('div', { class: 'mod-grid' }, [
          el('span', { class: 'caps', text: 'Amount' }), amount.node,
          el('span', { class: 'caps', text: 'Smoothing' }), smooth.node,
        ]),
        extra,
        more,
      ]);
      boxes.set(m.id, { node, fill, title, bars: { amount, smooth, offset } });
      mapList.append(node);
    }
  }
  const SOURCES_INDEX = Object.fromEntries(SOURCES.map((s) => [s.id, true]));

  // The little meter in each box shows its source moving.
  function showBoxMeters(values) {
    for (const [id, box] of boxes) {
      const m = store.state.mappings.find((x) => x.id === id);
      if (!m) continue;
      const value = values[m.source] ?? 0;
      if (describeSource(m.source).bipolar) {
        const v = Math.max(-1, Math.min(1, value));
        box.fill.style.left = `${v < 0 ? 50 + v * 50 : 50}%`;
        box.fill.style.width = `${Math.abs(v) * 50}%`;
      } else {
        box.fill.style.left = '0';
        box.fill.style.width = `${Math.max(0, Math.min(1, value)) * 100}%`;
      }
    }
  }

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
      const act = el('select', { onchange: () => update({ action: act.value }) }, Object.entries(actionOptions()).map(([id, label]) => el('option', { value: id, text: label })));
      if (![...act.options].some((o) => o.value === b.action)) act.append(el('option', { value: b.action, text: describeAction(b.action) }));
      act.value = b.action;
      const hold = el('input', { type: 'checkbox', checked: b.hold, onchange: () => update({ hold: hold.checked }) });
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
  // Their own tab: for each LFO a live meter, its shape as a row of small
  // pictures, tempo sync, and the rate (which only counts when it runs free).
  const lfoHost = el('div', { class: 'lfo-list' });
  let lfoMeters = [];

  function buildLfos() {
    lfoMeters = [];
    lfoHost.replaceChildren(
      ...store.state.lfos.map((lfo, i) => {
        const patch = (p) => store.patchItem('lfos', lfo.id, p);
        const fill = el('i');
        lfoMeters.push({ id: `lfo.${i + 1}`, fill });
        const rate = bar({ label: `LFO ${i + 1} rate in Hz`, min: 0.01, max: 10, step: 0.01, value: lfo.rate, reset: 1, unit: ' Hz', onInput: (v) => patch({ rate: v }) });
        const free = (sync) => {
          rate.node.classList.toggle('idle', sync > 0);
          rate.node.title = sync > 0 ? 'Locked to the tempo: the rate is not used' : '';
        };
        const shape = choice({ label: `LFO ${i + 1} shape`, options: SHAPE_ICONS, value: lfo.shape, onChange: (v) => patch({ shape: v }) });
        const sync = menu({
          label: `LFO ${i + 1} tempo sync`,
          options: Object.entries(LFO_SYNC).map(([label, value]) => ({ value, label })),
          value: lfo.sync ?? 0,
          onChange: (v) => {
            patch({ sync: v });
            free(v);
          },
        });
        free(lfo.sync ?? 0);
        return el('div', { class: 'lfo' }, [
          el('div', { class: 'lfo-head' }, [el('span', { class: 'lfo-name', text: `LFO ${i + 1}` }), el('div', { class: 'mod-meter bipolar', title: 'What it is doing now' }, [fill])]),
          el('div', { class: 'mod-grid' }, [
            el('span', { class: 'caps', text: 'shape' }), shape.node,
            el('span', { class: 'caps', text: 'tempo sync' }), sync.node,
            el('span', { class: 'caps', text: 'rate' }), rate.node,
          ]),
        ]);
      }),
    );
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
    showBoxMeters(m.values);
    for (const meter of lfoMeters) {
      const v = Math.max(-1, Math.min(1, m.values[meter.id] ?? 0));
      meter.fill.style.left = `${v < 0 ? 50 + v * 50 : 50}%`;
      meter.fill.style.width = `${Math.abs(v) * 50}%`;
    }
    // (The source lists are asked for afresh each time a menu opens.)
    if (grew) buildActions();
  });

  // -------------------------------------------------------------- layout --
  store.subscribe((op, state, remote) => {
    if (op.op === 'scene' || op.op === 'replace') {
      buildMappings();
      buildLfos();
    }
    if (op.op === 'replace' || (op.op === 'set' && op.key === 'actions')) buildActions();
    if (op.op === 'item' && op.list === 'mappings') {
      // A bar being dragged here must not be rebuilt under the pointer.
      const dragged = op.patch && Object.keys(op.patch).every((k) => k === 'amount' || k === 'offset' || k === 'smooth');
      if (!dragged || remote) buildMappings();
    }
    if (op.op === 'item' && op.list === 'lfos' && remote) buildLfos();
  });

  roots.edit.append(
    el('div', { id: 'mappings-panel' }, [
      mapList,
      mapNote,
      el('button', { class: 'primary add-mod', text: '+ Add modulation', onclick: () => addMapping() }),
    ]),
  );
  roots.lfos.append(lfoHost);
  roots.setup.append(
    el('div', { class: 'panel', id: 'actions-panel' }, [
      el('h2', { text: 'Triggers and MIDI controls' }),
      actionList,
      el('div', { class: 'row' }, [el('button', { text: 'Add trigger', onclick: () => setActions([...store.state.actions, makeActionBinding('phone.shake', 'glitch')]) })]),
      el('div', { class: 'dim small', text: 'Phone buttons, gestures, beats and MIDI controls all live here. The quickest way to add a MIDI control is MIDI map, top right.' }),
    ]),
    el('div', { class: 'panel', id: 'sources-panel' }, [el('h2', { text: 'Sources' }), meters]),
  );
  ui.presets?.onChange(buildActions);
  buildMappings();
  buildActions();
  buildLfos();
}
