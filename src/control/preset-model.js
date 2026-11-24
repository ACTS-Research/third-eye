// The preset list as /control sees it: load, save, reorder, and keep the
// "current preset" index in the shared state pointing at the right one.
// The shows (each a name, a tempo and steps that point at presets) are kept
// here too: the live show's steps are `steps`, with "which step it is at"
// looked after the same way.

import { PRESETS_KEY, SHOWS_KEY, cleanShowName, liveShow, loadPresets, loadShows, orderView, saveShows, savePresets, snapshotPreset } from '../shared/presets.js';
import { sceneOf } from '../shared/state.js';
import { uid } from '../shared/util.js';

export function createPresetModel(ui) {
  const { store } = ui;
  let list = loadPresets();
  let shows = loadShows(list);
  let steps = liveShow(shows).steps;
  const listeners = new Set();
  const changed = () => {
    for (const fn of listeners) fn();
  };
  const commit = () => {
    savePresets(list);
    changed();
  };
  const setCurrent = (index) => store.dispatch({ op: 'presetIndex', index });
  const saveAllShows = () => {
    liveShow(shows).steps = steps;
    saveShows(shows);
  };
  // Saves the steps and moves "where the order is at" in one go.
  const commitSteps = (cue, off) => {
    saveAllShows();
    const now = store.state.order;
    if (cue !== undefined && (cue !== now.cue || off !== now.off)) store.merge('order', { cue, off });
    else changed();
  };
  const reread = () => {
    list = loadPresets();
    shows = loadShows(list);
    steps = liveShow(shows).steps;
  };
  // A name no other show has.
  const freeName = (name, except = '') => {
    const taken = (n) => shows.shows.some((x) => x.id !== except && x.name.toLowerCase() === n.toLowerCase());
    if (!taken(name)) return name;
    for (let i = 2; ; i++) {
      const next = `${name.slice(0, 36)} ${i}`;
      if (!taken(next)) return next;
    }
  };
  const newId = () => {
    let id;
    do id = uid();
    while (id.length < 3 || shows.shows.some((x) => x.id === id));
    return id;
  };

  // Another control window may have edited the list.
  window.addEventListener('storage', (e) => {
    if (e.key && e.key !== PRESETS_KEY && e.key !== SHOWS_KEY) return;
    reread();
    changed();
  });
  store.subscribe((op) => {
    if (op.op === 'scene' || op.op === 'replace' || op.op === 'presetIndex' || (op.op === 'merge' && op.key === 'order')) changed();
    // A tempo set while a show is live is that show's tempo.
    if (op.op === 'merge' && op.key === 'tempo' && 'bpm' in op.patch) {
      const show = liveShow(shows);
      const bpm = store.state.tempo.bpm;
      if (show.bpm !== bpm) {
        show.bpm = bpm;
        saveAllShows();
        changed();
      }
    }
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
      reread();
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
      const { id } = list[index];
      list.splice(index, 1);
      savePresets(list);
      // Its steps go with it, from every show; the live show stays on the
      // step it was at.
      for (const show of shows.shows) if (show !== liveShow(shows)) show.steps = show.steps.filter((s) => s.preset !== id);
      if (steps.some((s) => s.preset === id)) {
        const { cue, off } = store.state.order;
        const before = steps.slice(0, Math.max(0, cue)).filter((s) => s.preset === id).length;
        const gone = steps[cue]?.preset === id;
        steps = steps.filter((s) => s.preset !== id);
        saveAllShows();
        if (cue >= 0) store.merge('order', { cue: Math.min(cue - before, steps.length - 1), off: (off || gone) && steps.length > 0 });
      } else saveAllShows();
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

    // ----------------------------------------------------- running order ---
    get steps() {
      return steps;
    },
    // The steps with their presets, the live one and the one Next loads.
    get order() {
      return orderView(store.state, list);
    },
    addStep(presetIndex) {
      if (!list[presetIndex]) return;
      steps.push({ preset: list[presetIndex].id, note: '', fade: null });
      commitSteps();
    },
    updateStep(index, patch) {
      if (!steps[index]) return;
      steps[index] = { ...steps[index], ...patch };
      commitSteps();
    },
    removeStep(index) {
      if (!steps[index]) return;
      steps.splice(index, 1);
      const { cue, off } = store.state.order;
      // Removing the step that is live leaves the picture alone: the order
      // waits on the step that took its place.
      if (cue === index) commitSteps(Math.min(cue, steps.length - 1), steps.length > 0);
      else commitSteps(cue > index ? cue - 1 : cue, off);
    },
    moveStep(from, to) {
      if (from === to || !steps[from] || !steps[to]) return;
      const [item] = steps.splice(from, 1);
      steps.splice(to, 0, item);
      const { cue, off } = store.state.order;
      let next = cue;
      if (cue === from) next = to;
      else if (from < cue && to >= cue) next = cue - 1;
      else if (from > cue && to <= cue) next = cue + 1;
      commitSteps(next, off);
    },
    setSteps(next) {
      steps = next.filter((s) => list.some((p) => p.id === s.preset));
      commitSteps(-1, false);
    },

    // ------------------------------------------------------------- shows ---
    get shows() {
      return shows.shows;
    },
    get live() {
      return liveShow(shows);
    },
    // Makes a show live: its steps are what Next walks, from the start, and
    // its tempo (when it has one) is the tempo.
    makeLive(id) {
      const show = shows.shows.find((x) => x.id === id);
      if (!show) return;
      shows.live = id;
      steps = show.steps;
      saveShows(shows);
      if (show.bpm !== null && show.bpm !== store.state.tempo.bpm) store.merge('tempo', { bpm: show.bpm });
      const now = store.state.order;
      if (now.cue !== -1 || now.off) store.merge('order', { cue: -1, off: false });
      else changed();
    },
    // A new show, empty, with the tempo as it is now; it goes live.
    newShow(name = 'New show') {
      const show = { id: newId(), name: freeName(cleanShowName(name)), bpm: store.state.tempo.bpm, steps: [] };
      shows.shows.push(show);
      this.makeLive(show.id);
      return show;
    },
    renameShow(id, name) {
      const show = shows.shows.find((x) => x.id === id);
      if (!show) return;
      show.name = freeName(cleanShowName(name, show.name), id);
      saveAllShows();
      changed();
    },
    duplicateShow(id) {
      const show = shows.shows.find((x) => x.id === id);
      if (!show) return null;
      const copy = { id: newId(), name: freeName(`${show.name.slice(0, 34)} copy`), bpm: show.bpm, steps: show.steps.map((s) => ({ ...s })) };
      shows.shows.splice(shows.shows.indexOf(show) + 1, 0, copy);
      this.makeLive(copy.id);
      return copy;
    },
    // The last show cannot go: it is emptied instead.
    deleteShow(id) {
      const at = shows.shows.findIndex((x) => x.id === id);
      if (at < 0) return;
      if (shows.shows.length === 1) {
        shows.shows[0] = { ...shows.shows[0], steps: [] };
        steps = shows.shows[0].steps;
        commitSteps(-1, false);
        return;
      }
      const wasLive = shows.live === id;
      shows.shows.splice(at, 1);
      if (wasLive) this.makeLive(shows.shows[Math.min(at, shows.shows.length - 1)].id);
      else {
        saveShows(shows);
        changed();
      }
    },
    // Adds a show (from a file), names it apart from the others, makes it live.
    addShow({ name, bpm, steps: incoming }, live = true) {
      const show = { id: newId(), name: freeName(cleanShowName(name)), bpm, steps: incoming.filter((s) => list.some((p) => p.id === s.preset)) };
      shows.shows.push(show);
      if (live) this.makeLive(show.id);
      else {
        saveShows(shows);
        changed();
      }
      return show;
    },
    // Presets a show file brings: added when new here; one with the same id
    // replaces ours only when `take` says so.
    mergePresets(incoming, take) {
      for (const p of incoming) {
        const at = list.findIndex((q) => q.id === p.id);
        if (at < 0) list.push(p);
        else if (take) list[at] = { ...p };
      }
      savePresets(list);
    },
    // The live show's data with the library (for files and the backup).
    get showData() {
      return shows;
    },
  };
}
