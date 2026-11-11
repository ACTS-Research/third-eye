// Effects chain editor. Each effect is a card whose controls are generated
// from the effect's parameter declarations.

import { Pane } from 'tweakpane';
import { EFFECTS, EFFECT_BY_ID } from '../effects/index.js';
import { makeEffect, sceneOf } from '../shared/state.js';
import { el } from '../shared/util.js';

export function mountChain(root, ui) {
  const { store } = ui;
  const cards = new Map();
  const collapsed = new Set();
  let guard = false;

  const picker = el('select', { class: 'grow' }, EFFECTS.map((def) => el('option', { value: def.id, text: def.name })));
  const addBtn = el('button', { class: 'primary', text: 'Add effect', onclick: () => mutate((chain) => chain.push(makeEffect(picker.value))) });
  const list = el('div', { class: 'col', style: 'overflow:visible' });

  root.append(
    el('div', { class: 'panel' }, [el('h2', { text: 'Effects chain' }), el('div', { class: 'row' }, [picker, addBtn])]),
    list,
  );

  // Structural edits replace the scene; effects that survive keep their uid
  // so /output keeps their feedback buffers.
  function mutate(fn) {
    const scene = sceneOf(store.state);
    fn(scene.chain);
    store.setScene(scene);
  }

  function move(uid, delta) {
    mutate((chain) => {
      const i = chain.findIndex((it) => it.uid === uid);
      const j = i + delta;
      if (i < 0 || j < 0 || j >= chain.length) return;
      [chain[i], chain[j]] = [chain[j], chain[i]];
    });
  }

  function buildCard(item, index, count) {
    const def = EFFECT_BY_ID[item.type];
    const body = el('div', { class: 'fx-body tp-host' });
    const bypass = el('button', {
      class: 'icon',
      text: 'Bypass',
      title: 'Skip this effect',
      onclick: () => store.patchItem('chain', item.uid, { bypass: !store.findEffect(item.uid)?.bypass }),
    });
    const name = el('span', {
      class: 'name',
      text: def.name,
      title: 'Click to collapse',
      onclick: () => {
        if (collapsed.has(item.uid)) collapsed.delete(item.uid);
        else collapsed.add(item.uid);
        body.classList.toggle('collapsed', collapsed.has(item.uid));
      },
    });
    const node = el('div', { class: 'fx', 'data-uid': item.uid, 'data-type': item.type }, [
      el('div', { class: 'fx-head' }, [
        el('span', { class: 'num', text: String(index + 1) }),
        name,
        bypass,
        el('button', { class: 'icon', text: '↑', title: 'Move earlier', disabled: index === 0, onclick: () => move(item.uid, -1) }),
        el('button', { class: 'icon', text: '↓', title: 'Move later', disabled: index === count - 1, onclick: () => move(item.uid, 1) }),
        el('button', { class: 'icon', text: '✕', title: 'Remove', onclick: () => mutate((chain) => chain.splice(chain.findIndex((it) => it.uid === item.uid), 1)) }),
      ]),
      body,
    ]);
    body.classList.toggle('collapsed', collapsed.has(item.uid));

    const pane = new Pane({ container: body });
    const model = { mix: item.mix, target: item.target };
    // Needs Segmentation (Vision panel) to be on for anything but Everything.
    pane
      .addBinding(model, 'target', { label: 'apply to', options: { Everything: 'all', 'Person only': 'person', 'Background only': 'background' } })
      .on('change', (ev) => {
        if (!guard) store.patchItem('chain', item.uid, { target: ev.value });
      });
    pane.addBinding(model, 'mix', { label: 'wet / dry', min: 0, max: 1, step: 0.01 }).on('change', (ev) => {
      if (guard) return;
      ui.lastTouched = { uid: item.uid, key: 'mix' };
      ui.onParamTouched?.(`${def.name} · wet / dry`);
      store.patchItem('chain', item.uid, { mix: ev.value });
    });
    for (const [key, spec] of Object.entries(def.params)) {
      const label = spec.label ?? key;
      let binding;
      if (spec.options) {
        model[key] = item.params[key];
        binding = pane.addBinding(model, key, { label, options: spec.options });
      } else if (spec.type === 'bool') {
        model[key] = item.params[key] > 0.5;
        binding = pane.addBinding(model, key, { label });
      } else {
        model[key] = item.params[key];
        binding = pane.addBinding(model, key, { label, min: spec.min, max: spec.max, step: spec.step });
      }
      binding.on('change', (ev) => {
        if (guard) return;
        ui.lastTouched = { uid: item.uid, key };
        ui.onParamTouched?.(`${def.name} · ${label}`);
        store.setParam(item.uid, key, typeof ev.value === 'boolean' ? (ev.value ? 1 : 0) : ev.value);
      });
    }

    const card = { node, pane, model, bypass, def };
    syncCard(card, item);
    return card;
  }

  function syncCard(card, item) {
    card.node.classList.toggle('bypassed', item.bypass);
    card.bypass.classList.toggle('on', item.bypass);
  }

  function refresh(card, item) {
    guard = true;
    card.model.mix = item.mix;
    card.model.target = item.target;
    for (const [key, spec] of Object.entries(card.def.params)) {
      card.model[key] = spec.type === 'bool' ? item.params[key] > 0.5 : item.params[key];
    }
    card.pane.refresh();
    guard = false;
    syncCard(card, item);
  }

  function rebuild() {
    for (const card of cards.values()) card.pane.dispose();
    cards.clear();
    list.replaceChildren();
    const chain = store.state.chain;
    if (!chain.length) {
      list.append(el('div', { class: 'empty', text: 'No effects. The input goes straight to the output.' }));
      return;
    }
    chain.forEach((item, i) => {
      const card = buildCard(item, i, chain.length);
      cards.set(item.uid, card);
      list.append(card.node);
    });
  }

  store.subscribe((op, state, remote) => {
    if (op.op === 'scene' || op.op === 'replace') {
      rebuild();
    } else if (op.op === 'param') {
      const card = cards.get(op.uid);
      const item = store.findEffect(op.uid);
      if (card && item && remote) refresh(card, item);
    } else if (op.op === 'item' && op.list === 'chain') {
      const card = cards.get(op.id);
      const item = store.findEffect(op.id);
      if (!card || !item) return;
      if (remote) refresh(card, item);
      else syncCard(card, item);
    }
  });

  rebuild();
  ui.rebuildChain = rebuild;
}
