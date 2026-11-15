// The effects chain on the edit screen: a row of buttons under the picture,
// one per effect in the order the picture passes through them, and the
// Parameters tab showing the controls of the one that is open. The controls
// are generated from the effect's parameter declarations.

import { EFFECTS, EFFECT_BY_ID } from '../effects/index.js';
import { describeSource } from '../shared/sources.js';
import { INPUT_LABELS, makeEffect, sceneOf } from '../shared/state.js';
import { el } from '../shared/util.js';
import { bar, menu, toggle } from './controls.js';

const TARGETS = [
  { value: 'all', label: 'Everything' },
  { value: 'person', label: 'Person only' },
  { value: 'background', label: 'Background only' },
];

export function mountChain(roots, ui) {
  const { store } = ui;
  const row = roots.chain;
  const pane = roots.params;
  let selected = null; // uid of the effect that is open
  let controls = new Map(); // key -> { set(value) } for the open effect
  let dragFrom = -1;

  // Structural edits replace the scene; effects that survive keep their uid
  // so the engine keeps their feedback buffers.
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

  const current = () => store.state.chain.find((it) => it.uid === selected) ?? store.state.chain[0] ?? null;

  function select(uid) {
    selected = uid;
    build();
  }
  ui.selectEffect = select;
  // Opens the effect a slider belongs to, on the Parameters tab.
  ui.showParam = (fx) => {
    if (store.findEffect(fx)) selected = fx;
    ui.setEditTab('params');
    build();
  };

  // ------------------------------------------------------- the chain row ---
  function buildRow() {
    const chain = store.state.chain;
    const open = current();
    row.replaceChildren(el('span', { class: 'chain-end', text: `In: ${INPUT_LABELS[store.state.input.kind] ?? store.state.input.kind}` }));
    chain.forEach((item, i) => {
      const def = EFFECT_BY_ID[item.type];
      const faders = (store.state.macros ?? []).filter((s) => s?.fx === item.uid).length;
      const moved = new Set(store.state.mappings.filter((m) => m.fx === item.uid).map((m) => m.key)).size;
      const meta = [faders ? `${faders} fader${faders === 1 ? '' : 's'}` : '', moved ? `${moved} moved` : '', item.bypass ? 'bypassed' : ''].filter(Boolean).join(' · ');
      const button = el('button', { class: `fx${item.bypass ? ' bypassed' : ''}`, 'data-uid': item.uid, 'data-type': item.type, 'aria-pressed': String(item === open), title: 'Click to open. Drag to reorder.', draggable: true, onclick: () => select(item.uid) }, [
        el('span', { class: 'num', text: String(i + 1) }),
        el('span', { class: 'fx-text' }, [el('span', { class: 'name', text: def.name }), el('span', { class: 'meta', text: meta || ' ' })]),
      ]);
      button.addEventListener('dragstart', (e) => {
        dragFrom = i;
        e.dataTransfer.effectAllowed = 'move';
        e.dataTransfer.setData('text/plain', String(i));
      });
      button.addEventListener('dragend', () => {
        dragFrom = -1;
        for (const b of row.querySelectorAll('.fx')) b.classList.remove('drop-here');
      });
      button.addEventListener('dragover', (e) => {
        if (dragFrom < 0) return;
        e.preventDefault();
        button.classList.toggle('drop-here', dragFrom !== i);
      });
      button.addEventListener('dragleave', () => button.classList.remove('drop-here'));
      button.addEventListener('drop', (e) => {
        e.preventDefault();
        const from = dragFrom;
        if (from < 0 || from === i) return;
        mutate((list) => list.splice(i, 0, list.splice(from, 1)[0]));
      });
      row.append(el('span', { class: 'chain-arrow', 'aria-hidden': 'true', text: '→' }), button);
    });
    const add = menu({
      action: true,
      text: '+ Add effect',
      label: 'Add an effect',
      id: 'add-effect',
      cls: 'add-effect',
      options: EFFECTS.map((def) => ({ value: def.id, label: def.name })),
      onChange: (type) => {
        const effect = makeEffect(type);
        selected = effect.uid;
        mutate((list) => list.push(effect));
        ui.setEditTab('params');
      },
    });
    row.append(el('span', { class: 'chain-arrow', 'aria-hidden': 'true', text: '→' }), add.node);
  }

  // --------------------------------------------------- the open effect ---
  // What moves a slider by itself, for its Mod button.
  function modText(fx, key) {
    const mine = store.state.mappings.filter((m) => m.fx === fx && m.key === key);
    if (!mine.length) return { text: '+ Mod', on: false };
    return { text: `~ ${describeSource(mine[0].source).label}${mine.length > 1 ? ` +${mine.length - 1}` : ''}`, on: true };
  }

  function buildParams() {
    controls = new Map();
    pane.replaceChildren();
    const item = current();
    if (!item) {
      pane.append(el('div', { class: 'empty', text: 'No effects. The input goes straight to the output. Add one under the picture.' }));
      return;
    }
    const chain = store.state.chain;
    const index = chain.indexOf(item);
    const def = EFFECT_BY_ID[item.type];
    const bypass = toggle({
      on: item.bypass,
      text: 'Bypass',
      label: `Bypass ${def.name}`,
      onChange: () => store.patchItem('chain', item.uid, { bypass: !store.findEffect(item.uid)?.bypass }),
    });
    bypass.node.title = 'Skip this effect';
    controls.set('$bypass', bypass);
    pane.append(
      el('div', { class: 'fx-head' }, [
        el('span', { class: 'num', text: String(index + 1) }),
        el('span', { class: 'name', text: def.name }),
        bypass.node,
        el('button', { class: 'icon', text: '←', title: 'Move earlier', disabled: index === 0, onclick: () => move(item.uid, -1) }),
        el('button', { class: 'icon', text: '→', title: 'Move later', disabled: index === chain.length - 1, onclick: () => move(item.uid, 1) }),
        el('button', { class: 'icon', text: '✕', title: 'Remove', onclick: () => {
          const next = chain[index + 1] ?? chain[index - 1];
          selected = next?.uid ?? null;
          mutate((list) => list.splice(list.findIndex((it) => it.uid === item.uid), 1));
        } }),
      ]),
    );

    const touched = (key, label) => {
      ui.lastTouched = { uid: item.uid, key };
      ui.onParamTouched?.(`${def.name} · ${label}`);
    };
    const rowFor = (key, label, field, buttons = []) => el('div', { class: 'param', 'data-key': key }, [el('label', { for: `p-${item.uid}-${key}`, text: label }), field, ...buttons]);

    // Needs Segmentation (Setup → Vision) to be on for anything but Everything.
    const target = menu({ id: `p-${item.uid}-target`, label: 'Apply to', options: TARGETS, value: item.target, onChange: (v) => store.patchItem('chain', item.uid, { target: v }) });
    controls.set('$target', target);
    pane.append(rowFor('target', 'apply to', target.node));

    const slider = (key, label, spec, value, write) => {
      const control = bar({
        id: `p-${item.uid}-${key}`,
        label,
        min: spec.min,
        max: spec.max,
        step: spec.step ?? (spec.max - spec.min) / 100,
        value,
        reset: spec.default,
        onTouch: () => touched(key, label),
        onInput: (v) => {
          touched(key, label);
          write(v);
        },
      });
      const pinned = ui.pinIndex?.(item.uid, key) ?? -1;
      const pin = el('button', {
        class: 'pin-toggle',
        'aria-pressed': String(pinned >= 0),
        text: pinned >= 0 ? `Fader ${pinned + 1}` : 'Fader',
        title: pinned >= 0 ? 'On the perform screen. Click to take it off.' : 'Show this as a fader on the perform screen',
        onclick: () => {
          if (ui.togglePin?.(item.uid, key) === false) pin.title = 'All eight faders are in use. Take one off under Faders first.';
        },
      });
      const mod = modText(item.uid, key);
      const modButton = el('button', { class: 'mod-toggle', 'aria-pressed': String(mod.on), text: mod.text, title: mod.on ? 'Moved by itself. Click to see what moves it.' : 'Have something move this by itself', onclick: () => ui.openMod?.(item.uid, key) });
      controls.set(key, control);
      controls.set(`${key}$mod`, { set: () => {
        const now = modText(item.uid, key);
        modButton.textContent = now.text;
        modButton.setAttribute('aria-pressed', String(now.on));
      } });
      return rowFor(key, label, control.node, [pin, modButton]);
    };

    pane.append(slider('mix', 'wet / dry', { min: 0, max: 1, step: 0.01, default: 1 }, item.mix, (v) => store.patchItem('chain', item.uid, { mix: v })));
    for (const [key, spec] of Object.entries(def.params)) {
      const label = spec.label ?? key;
      if (spec.options) {
        const choice = menu({
          id: `p-${item.uid}-${key}`,
          label,
          options: Object.entries(spec.options).map(([text, value]) => ({ value, label: text })),
          value: item.params[key],
          onChange: (v) => {
            touched(key, label);
            store.setParam(item.uid, key, v);
          },
        });
        controls.set(key, choice);
        pane.append(rowFor(key, label, choice.node));
      } else if (spec.type === 'bool') {
        const sw = toggle({
          on: item.params[key] > 0.5,
          text: 'Off',
          onText: 'On',
          label,
          onChange: (on) => {
            touched(key, label);
            store.setParam(item.uid, key, on ? 1 : 0);
          },
        });
        sw.node.id = `p-${item.uid}-${key}`;
        controls.set(key, { set: (v) => sw.set(v > 0.5) });
        pane.append(rowFor(key, label, sw.node));
      } else {
        pane.append(slider(key, label, spec, item.params[key], (v) => store.setParam(item.uid, key, v)));
      }
    }
  }

  function build() {
    // Keep the open effect open while it exists.
    if (!store.findEffect(selected)) selected = store.state.chain[0]?.uid ?? null;
    buildRow();
    buildParams();
  }

  // Brings the open effect's controls up to date without rebuilding them.
  function refresh(item) {
    if (!item || item.uid !== current()?.uid) return;
    controls.get('$target')?.set(item.target);
    controls.get('$bypass')?.set(item.bypass);
    controls.get('mix')?.set(item.mix);
    for (const key of Object.keys(EFFECT_BY_ID[item.type].params)) controls.get(key)?.set(item.params[key]);
  }

  store.subscribe((op) => {
    if (op.op === 'scene' || op.op === 'replace') {
      build();
    } else if (op.op === 'param') {
      refresh(store.findEffect(op.uid));
    } else if (op.op === 'item' && op.list === 'chain') {
      refresh(store.findEffect(op.id));
      if (op.patch && 'bypass' in op.patch) buildRow();
    } else if (op.op === 'item' && op.list === 'mappings' && op.patch && ('source' in op.patch || 'fx' in op.patch || 'key' in op.patch)) {
      // A mapping changed its source or target: the Mod buttons and the
      // counts on the chain row follow.
      for (const [key, control] of controls) if (key.endsWith('$mod')) control.set();
      buildRow();
    } else if (op.op === 'merge' && op.key === 'input') {
      buildRow();
    }
  });

  ui.refreshChain = build;
  build();
}
