// The preset list as /control sees it: load, save, reorder, and keep the
// "current preset" index in the shared state pointing at the right one.
// The shows (each a name, a tempo and steps that point at presets) are kept
// here too: the live show's steps are `steps`, with "which step it is at"
// looked after the same way.
//
// A show's MIDI controls (`show.midi`) are kept here as well. The engine
// reads only the state's `actions`, so:
//   - when a show goes live, and when this page starts, the state takes the
//     live show's MIDI (`useMidi`);
//   - when a control is mapped, cleared or changed in this window, the live
//     show takes the state's (`keepMidi`).
// A change made in another window is left to that window to store (it
// arrives here as a storage event): this one may not yet know which show is
// live there.

import { PRESETS_KEY, SHOWS_KEY, cleanShowName, liveShow, loadPresets, loadShows, midiOf, orderView, saveShows, savePresets, snapshotPreset, withMidi } from '../shared/presets.js';
import { sceneOf } from '../shared/state.js';
import { uid } from '../shared/util.js';

const sameMidi = (a, b) => a.length === b.length && a.every((x, i) => x.source === b[i].source && x.action === b[i].action && x.hold === b[i].hold);

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
  // ------------------------------------------------- a show's own MIDI ---
  const liveMidi = () => midiOf(store.state.actions);
  // A show with none of its own yet takes on the MIDI in use. True when any did.
  const adopt = () => {
    let any = false;
    for (const show of shows.shows) {
      if (show.midi) continue;
      show.midi = liveMidi();
      any = true;
    }
    return any;
  };
  // The state takes the live show's MIDI; every other binding stays.
  const useMidi = () => {
    const { midi } = liveShow(shows);
    if (!sameMidi(midi, liveMidi())) store.dispatch({ op: 'set', key: 'actions', value: withMidi(store.state.actions, midi) });
  };
  // The live show takes the state's MIDI.
  const keepMidi = () => {
    const show = liveShow(shows);
    const now = liveMidi();
    if (sameMidi(show.midi, now)) return;
    show.midi = now;
    saveAllShows();
    changed();
  };

  const reread = () => {
    list = loadPresets();
    shows = loadShows(list);
    steps = liveShow(shows).steps;
    adopt();
  };
  // Shows from before they kept their MIDI each start with what is mapped
  // today, so nothing changes until a control is mapped.
  if (adopt()) saveShows(shows);
  useMidi();
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
  store.subscribe((op, _state, remote) => {
    if (op.op === 'scene' || op.op === 'replace' || op.op === 'presetIndex' || (op.op === 'merge' && op.key === 'order')) changed();
    if (op.op === 'set' && op.key === 'actions' && !remote) keepMidi();
    // Another window's whole state has just replaced this one's (it answers
    // every window that opens): the live show's MIDI still holds.
    if (op.op === 'replace' && remote) useMidi();
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
    // Makes a show live: its steps are what Next walks, from the start, its
    // tempo (when it has one) is the tempo, and its MIDI controls are the
    // ones that work.
    makeLive(id) {
      const show = shows.shows.find((x) => x.id === id);
      if (!show) return;
      shows.live = id;
      steps = show.steps;
      saveShows(shows);
      useMidi();
      if (show.bpm !== null && show.bpm !== store.state.tempo.bpm) store.merge('tempo', { bpm: show.bpm });
      const now = store.state.order;
      if (now.cue !== -1 || now.off) store.merge('order', { cue: -1, off: false });
      else changed();
    },
    // A new show, empty, with the tempo as it is now and the MIDI controls
    // of the show that was live; it goes live.
    newShow(name = 'New show') {
      const show = { id: newId(), name: freeName(cleanShowName(name)), bpm: store.state.tempo.bpm, steps: [], midi: liveMidi() };
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
      const copy = { id: newId(), name: freeName(`${show.name.slice(0, 34)} copy`), bpm: show.bpm, steps: show.steps.map((s) => ({ ...s })), midi: show.midi.map((b) => ({ ...b })) };
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
    // Adds a show (from a file), names it apart from the others, makes it
    // live. One that brings no MIDI controls takes on the live show's.
    addShow({ name, bpm, steps: incoming, midi = null }, live = true) {
      const show = { id: newId(), name: freeName(cleanShowName(name)), bpm, steps: incoming.filter((s) => list.some((p) => p.id === s.preset)), midi: midi ? midi.map((b) => ({ ...b })) : liveMidi() };
      shows.shows.push(show);
      if (live) this.makeLive(show.id);
      else {
        saveShows(shows);
        changed();
      }
      return show;
    },
    // Replaces the live show's MIDI controls with a copy of another show's.
    // Returns how many it now has, or -1 when there is no such other show.
    importMidi(fromId) {
      const from = shows.shows.find((x) => x.id === fromId);
      const show = liveShow(shows);
      if (!from || from === show) return -1;
      show.midi = from.midi.map((b) => ({ ...b }));
      saveAllShows();
      useMidi();
      changed();
      return show.midi.length;
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
