// The preset list as /control sees it: load, save, reorder, and keep the
// "current preset" index in the shared state pointing at the right one.

import { loadPresets, savePresets, snapshotPreset } from '../shared/presets.js';
import { sceneOf } from '../shared/state.js';

export function createPresetModel(ui) {
  const { store } = ui;
  let list = loadPresets();
  const listeners = new Set();
  const changed = () => {
    for (const fn of listeners) fn();
  };
  const commit = () => {
    savePresets(list);
    changed();
  };
  const setCurrent = (index) => store.dispatch({ op: 'presetIndex', index });

  // Another control window may have edited the list.
  window.addEventListener('storage', (e) => {
    if (e.key && !e.key.startsWith('thirdeye.presets')) return;
    list = loadPresets();
    changed();
  });
  store.subscribe((op) => {
    if (op.op === 'scene' || op.op === 'replace' || op.op === 'presetIndex') changed();
  });

  return {
    get list() {
      return list;
    },
    get current() {
      return store.state.presetIndex;
    },
    onChange(fn) {
      listeners.add(fn);
    },
    reload() {
      list = loadPresets();
      changed();
    },
    // Saves the live scene as a new preset and makes it current.
    addFromLive(name, after = list.length - 1) {
      const preset = snapshotPreset(store, name ?? `Preset ${list.length + 1}`);
      list.splice(after + 1, 0, preset);
      savePresets(list);
      setCurrent(after + 1);
      return after + 1;
    },
    update(index, patch) {
      if (!list[index]) return;
      list[index] = { ...list[index], ...patch };
      commit();
    },
    saveLiveInto(index) {
      this.update(index, { scene: sceneOf(store.state) });
    },
    remove(index) {
      if (!list[index]) return;
      list.splice(index, 1);
      savePresets(list);
      const cur = store.state.presetIndex;
      setCurrent(cur === index ? -1 : cur > index ? cur - 1 : cur);
    },
    move(from, to) {
      if (from === to || !list[from]) return;
      const [item] = list.splice(from, 1);
      list.splice(to, 0, item);
      savePresets(list);
      // The current preset keeps its identity, not its slot.
      const cur = store.state.presetIndex;
      let next = cur;
      if (cur === from) next = to;
      else if (from < cur && to >= cur) next = cur - 1;
      else if (from > cur && to <= cur) next = cur + 1;
      if (next !== cur) setCurrent(next);
      else changed();
    },
    append(presets) {
      list.push(...presets);
      commit();
    },
  };
}
