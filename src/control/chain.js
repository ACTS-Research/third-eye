// The effects chain on the edit screen: a row of buttons under the picture,
// one per effect in the order the picture passes through them, and the
// Parameters tab showing the controls of the one that is open. The controls
// are generated from the effect's parameter declarations.

import { EFFECTS, EFFECT_BY_ID, paramUnit, paramValue } from '../effects/index.js';
import { describeSource } from '../shared/sources.js';
import { makeEffect, sceneOf } from '../shared/state.js';
import { el } from '../shared/util.js';
import { bar, choice, menu, toggle } from './controls.js';

const TARGETS = [
  { value: 'all', label: 'Everything' },
  { value: 'person', label: 'Person only' },
  { value: 'background', label: 'Background only' },
];

export function mountChain(roots, ui) {
  const { store, bus } = ui;
  const row = roots.chain;
  const pane = roots.params;
  let selected = null; // uid of the effect that is open
  let controls = new Map(); // key -> { set(value) } for the open effect
  let bars = new Map(); // key -> { control, spec, modButton, label() } for its sliders
  let ranging = null; // key of the slider whose range is being drawn
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
    row.replaceChildren();
    chain.forEach((item, i) => {
      const def = EFFECT_BY_ID[item.type];
      // The number is the effect's switch: a click on it bypasses the effect
      // (or brings it back) without opening it. The Bypass switch on the
      // Parameters tab does the same from the keyboard.
      const num = el('span', { class: 'num', text: String(i + 1), title: item.bypass ? `Bypassed. Click to bring ${def.name} back.` : `Click to bypass ${def.name}.`, onclick: (e) => {
        e.stopPropagation();
        store.patchItem('chain', item.uid, { bypass: !store.findEffect(item.uid)?.bypass });
      } });
      const button = el('button', { class: `fx${item.bypass ? ' bypassed' : ''}`, 'data-uid': item.uid, 'data-type': item.type, 'aria-pressed': String(item === open), title: 'Click the name to open, the number to bypass. Drag to reorder.', draggable: true, onclick: () => select(item.uid) }, [
        num,
        el('span', { class: 'fx-text' }, [el('span', { class: 'name', text: def.name }), el('span', { class: 'meta', text: item.bypass ? 'bypassed' : '\u00a0' })]),
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
      if (i) row.append(el('span', { class: 'chain-arrow', 'aria-hidden': 'true', text: '→' }));
      row.append(button);
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
    if (chain.length) row.append(el('span', { class: 'chain-arrow', 'aria-hidden': 'true', text: '→' }));
    row.append(add.node);
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
    bars = new Map();
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
        scale: spec.curve ? { toUnit: (v) => paramUnit(spec, v), fromUnit: (u) => paramValue(spec, u), center: spec.center } : null,
        look: spec.look ?? '',
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
      // What moves this slider. The name on the button arms range mode
      // (draw on the bar how far the slider is moved); the arrow opens the
      // menu: None, More settings, the sources already in use, then all.
      const mine = () => store.state.mappings.find((m) => m.fx === item.uid && m.key === key);
      const sourceMenu = menu({
        action: true,
        text: '▾',
        cls: 'mod-menu',
        label: `What moves ${label}`,
        mark: () => mine()?.source ?? '$none',
        options: () => {
          const used = [...new Set(store.state.mappings.map((m) => m.source))];
          const entry = (id, group) => ({ value: id, label: describeSource(id).label, group: group ?? describeSource(id).group });
          return [
            { value: '$none', label: 'None', pin: true },
            { value: '$more', label: 'More settings →', pin: true, cls: 'link', disabled: !mine() },
            ...used.map((id) => entry(id, 'In use')),
            ...(ui.knownSources?.() ?? []).map((id) => entry(id)),
          ];
        },
        onChange: (v) => {
          touched(key, label);
          const m = mine();
          if (v === '$none') {
            ranging = null;
            if (m) store.setScene({ ...sceneOf(store.state), mappings: store.state.mappings.filter((x) => !(x.fx === item.uid && x.key === key)) });
          } else if (v === '$more') {
            ranging = null;
            ui.openMod?.(item.uid, key);
          } else {
            // A source just chosen: straight on to drawing its range.
            ranging = key;
            if (m) store.patchItem('mappings', m.id, { source: v });
            else ui.addMapping?.(v, { amount: 0.25 }, { fx: item.uid, key });
            applyRange();
          }
        },
      });
      const mod = modText(item.uid, key);
      const modButton = el('button', { class: 'mod-toggle', 'aria-pressed': String(mod.on), text: mod.text, title: mod.on ? 'Click, then draw on the bar how far it is moved. Click again when done.' : 'Have something move this by itself', onclick: () => {
        touched(key, label);
        if (!mine()) return sourceMenu.open();
        ranging = ranging === key ? null : key;
        applyRange();
      } });
      controls.set(key, control);
      bars.set(key, { control, spec, modButton, label: () => pane.querySelector(`.param[data-key="${key}"] label`) });
      controls.set(`${key}$mod`, { set: () => {
        const now = modText(item.uid, key);
        modButton.textContent = now.text;
        modButton.setAttribute('aria-pressed', String(now.on));
      } });
      return rowFor(key, label, control.node, [pin, el('span', { class: 'mod-pair' }, [modButton, sourceMenu.node])]);
    };

    pane.append(slider('mix', def.mixLabel ?? 'wet / dry', { min: 0, max: 1, step: 0.01, default: 1 }, item.mix, (v) => store.patchItem('chain', item.uid, { mix: v })));
    for (const [key, spec] of Object.entries(def.params)) {
      const label = spec.label ?? key;
      if (spec.grid) {
        // Every choice in view, one click each (the Mix B modes).
        const grid = choice({
          cls: 'mode-grid',
          label,
          options: Object.entries(spec.options).map(([text, value]) => ({ value, label: text, text })),
          value: item.params[key],
          onChange: (v) => {
            touched(key, label);
            store.setParam(item.uid, key, v);
          },
        });
        grid.node.id = `p-${item.uid}-${key}`;
        controls.set(key, grid);
        pane.append(rowFor(key, label, grid.node));
      } else if (spec.options) {
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

  // Marks what has changed since the edit screen was opened: a dot by the
  // slider's name and a mark on its bar where the value was. Tells the edit
  // screen how many sliders of the whole chain differ, for Revert.
  function markChanges() {
    const before = ui.openedScene?.();
    const then = (uid) => before?.chain.find((it) => it.uid === uid);
    const open = current();
    const old = open && then(open.uid);
    for (const [key, { control, label }] of bars) {
      const now = key === 'mix' ? open?.mix : open?.params[key];
      const prev = old && (key === 'mix' ? old.mix : old.params?.[key]);
      const changed = prev !== undefined && prev !== null && now !== prev;
      control.setWas(changed ? prev : undefined);
      label()?.classList.toggle('changed', changed);
    }
    markJumps();
    let count = 0;
    for (const item of store.state.chain) {
      const prev = then(item.uid);
      if (!prev) continue;
      if (item.mix !== prev.mix) count++;
      for (const key of Object.keys(item.params)) if (prev.params?.[key] !== undefined && item.params[key] !== prev.params[key]) count++;
    }
    ui.onChangeCount?.(count);
  }
  ui.markChanges = markChanges;

  // Where Blink throws a slider of the open effect: the pointer on its bar.
  // Not while a blink is being captured (the sliders are at their landing
  // places then, and marked as changed).
  function markJumps() {
    const open = current();
    for (const [key, { control }] of bars) {
      const jump = !ui.blinkCapture && open && store.state.blink.jumps.find((j) => j.fx === open.uid && j.key === key);
      control.setJump?.(jump ? jump.to : undefined, (to) => ui.setJump?.(open.uid, key, to));
    }
  }
  ui.markJumps = markJumps;

  // Range mode: the slider named by `ranging` shows how far its first
  // modulation reaches, and a drag on its bar sets that.
  function applyRange() {
    const open = current();
    for (const [key, { control, spec, modButton }] of bars) {
      const m = open && key === ranging ? store.state.mappings.find((x) => x.fx === open.uid && x.key === key) : null;
      modButton.classList.toggle('ranging', !!m);
      if (!m) {
        control.setRange(null);
        continue;
      }
      const at = key === 'mix' ? open.mix : paramUnit(spec, open.params[key]);
      const set = m.mode === 'set';
      const both = !set && describeSource(m.source).bipolar;
      const clampUnit = (u) => Math.min(1, Math.max(0, u));
      const to = clampUnit(set ? (m.amount >= 0 ? m.amount : 1 + m.amount) : at + m.amount);
      const from = clampUnit(set ? (m.amount >= 0 ? 0 : 1) : both ? at - m.amount : at);
      control.setRange({ from, to }, (unit) => {
        const amount = set ? (m.amount >= 0 ? unit : unit - 1) : unit - at;
        store.patchItem('mappings', m.id, { amount: Math.round(Math.min(1, Math.max(-1, amount)) * 100) / 100 });
      });
    }
    if (ranging && !bars.has(ranging)) ranging = null;
  }
  // Esc, or a click anywhere but the bar and its button, leaves range mode.
  document.addEventListener('keydown', (e) => {
    if (e.key !== 'Escape' || !ranging) return;
    ranging = null;
    applyRange();
  });
  document.addEventListener('pointerdown', (e) => {
    if (!ranging) return;
    const row = pane.querySelector(`.param[data-key="${ranging}"]`);
    if (row?.contains(e.target) && (e.target.closest('input.bar') || e.target.closest('.mod-toggle'))) return;
    ranging = null;
    applyRange();
  }, true);

  // Where modulation has each moved slider of the open effect right now.
  bus?.on('sources', (m) => {
    const open = current();
    if (!open) return;
    for (const [key, { control }] of bars) control.setLive(m.mods?.[`${open.uid}:${key}`] ?? null);
  });

  function build() {
    // Keep the open effect open while it exists.
    if (!store.findEffect(selected)) selected = store.state.chain[0]?.uid ?? null;
    buildRow();
    buildParams();
    markChanges();
    applyRange();
  }

  // Brings the open effect's controls up to date without rebuilding them.
  function refresh(item) {
    if (!item || item.uid !== current()?.uid) return;
    controls.get('$target')?.set(item.target);
    controls.get('$bypass')?.set(item.bypass);
    controls.get('mix')?.set(item.mix);
    for (const key of Object.keys(EFFECT_BY_ID[item.type].params)) controls.get(key)?.set(item.params[key]);
    markChanges();
    applyRange();
  }

  store.subscribe((op) => {
    if (op.op === 'scene' || op.op === 'replace') {
      build();
    } else if (op.op === 'param') {
      refresh(store.findEffect(op.uid));
    } else if (op.op === 'item' && op.list === 'chain') {
      refresh(store.findEffect(op.id));
      if (op.patch && 'bypass' in op.patch) buildRow();
    } else if (op.op === 'item' && op.list === 'mappings' && op.patch && !('source' in op.patch || 'fx' in op.patch || 'key' in op.patch)) {
      // Its amount, or how it is applied: the range being drawn follows.
      applyRange();
    } else if (op.op === 'item' && op.list === 'mappings' && op.patch && ('source' in op.patch || 'fx' in op.patch || 'key' in op.patch)) {
      // A mapping changed its source or target: the Mod buttons and the
      // counts on the chain row follow.
      for (const [key, control] of controls) if (key.endsWith('$mod')) control.set();
      buildRow();
      applyRange();
    } else if (op.op === 'merge' && op.key === 'blink') {
      markJumps();
    }
  });

  ui.refreshChain = build;
  build();
}
