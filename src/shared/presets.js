// Presets: named scenes in localStorage, shared by /control and /output so a
// trigger on the phone can step through them even with /control closed.
//
// The running order sits beside them: a list of steps, each pointing at a
// preset, so one preset can be used several times in a show. With no steps
// the app behaves as if the running order did not exist.

import { factoryPresets } from './factory-presets.js';
import { sanitizeScene, sceneOf } from './state.js';
import { readJSON, uid, writeJSON } from './util.js';

export const PRESETS_KEY = 'thirdeye.presets.v1';
export const ORDER_KEY = 'thirdeye.order.v1';
const KEY = PRESETS_KEY;
const FILE_TAG = 'third-eye-cam-presets';

export const MAX_FADE = 30;
export const MAX_NOTE = 80;

const cleanFade = (value) => {
  const fade = Number(value);
  return value !== null && value !== undefined && value !== '' && Number.isFinite(fade) ? Math.min(MAX_FADE, Math.max(0, fade)) : null;
};

// A preset: { id, name, fade (seconds to crossfade in; null = the default),
// scene }. The id never changes, so a step in the running order still finds
// its preset after a rename or a reorder. `minted` is set when an id had to
// be made up (presets saved before ids existed, or two with the same id).
function clean(list, fresh = false) {
  const seen = new Set();
  let minted = false;
  const presets = list
    .filter((p) => p && typeof p === 'object' && p.scene)
    .map((p) => {
      let id = !fresh && typeof p.id === 'string' && /^[a-z0-9]{3,16}$/.test(p.id) && !seen.has(p.id) ? p.id : '';
      if (!id) {
        do id = uid();
        while (id.length < 3 || seen.has(id));
        minted = true;
      }
      seen.add(id);
      return {
        id,
        name: String(p.name ?? 'Untitled').slice(0, 60),
        fade: cleanFade(p.fade),
        scene: sanitizeScene(p.scene),
      };
    });
  return { presets, minted };
}

// The factory set has fixed ids, so every window agrees on them before
// anything has been saved.
const factory = () => factoryPresets().map((p, i) => ({ ...p, id: `fac${i}` }));

export function loadPresets() {
  const stored = readJSON(KEY, null);
  if (!Array.isArray(stored)) return clean(factory()).presets;
  const { presets, minted } = clean(stored);
  // Ids made up here are kept, or the next load would make up different ones.
  if (minted) writeJSON(KEY, presets);
  return presets;
}

export function savePresets(list) {
  writeJSON(KEY, list);
}

export function resetPresets() {
  savePresets(factory());
  saveOrder([]);
}

// Loads a preset into the live state, crossfading over the preset's own
// fade-in time (or `fade` seconds when given). This is a preset picked by
// hand: if a running order is under way it keeps its place (`offList`).
export function applyPreset(store, index, fade) {
  const list = loadPresets();
  if (!list.length) return;
  const i = ((index % list.length) + list.length) % list.length;
  store.dispatch({ op: 'scene', scene: list[i].scene, fade: fade ?? list[i].fade ?? store.state.globals.fadeTime, presetIndex: i, offList: true });
}

export function stepPreset(store, direction) {
  const current = store.state.presetIndex;
  applyPreset(store, current < 0 ? (direction > 0 ? 0 : -1) : current + direction);
}

export function snapshotPreset(store, name, fade = null) {
  return { id: uid() + uid().slice(0, 2), name, fade, scene: sceneOf(store.state) };
}

// --------------------------------------------------------- running order ---

// A step: { preset (a preset's id), note, fade (seconds; null = the
// preset's own) }. Steps whose preset no longer exists are left out.
export function loadOrder(presets = loadPresets()) {
  const stored = readJSON(ORDER_KEY, null);
  const steps = Array.isArray(stored?.steps) ? stored.steps : [];
  const known = new Set(presets.map((p) => p.id));
  return steps
    .filter((s) => s && typeof s === 'object' && known.has(s.preset))
    .map((s) => ({ preset: s.preset, note: String(s.note ?? '').slice(0, MAX_NOTE), fade: cleanFade(s.fade) }));
}

export function saveOrder(steps) {
  writeJSON(ORDER_KEY, { steps });
}

// Where the running order stands, for anything that draws it: the steps with
// their presets, which one is live, and which one Next would load.
export function orderView(state, presets = loadPresets()) {
  const steps = loadOrder(presets).map((s) => {
    const index = presets.findIndex((p) => p.id === s.preset);
    return { ...s, index, name: presets[index].name };
  });
  const last = steps.length - 1;
  const cue = Math.min(state.order?.cue ?? -1, last);
  const off = cue >= 0 && !!state.order?.off;
  // Off the list, Next and Prev both go back to the step that was left.
  const next = !steps.length ? -1 : cue < 0 ? 0 : off ? cue : cue < last ? cue + 1 : -1;
  return { steps, cue, off, live: off ? -1 : cue, next };
}

// Loads a step of the running order. Its own fade wins over its preset's.
export function applyStep(store, index) {
  const presets = loadPresets();
  const { steps } = orderView(store.state, presets);
  const step = steps[index];
  if (!step) return;
  const preset = presets[step.index];
  store.dispatch({ op: 'scene', scene: preset.scene, fade: step.fade ?? preset.fade ?? store.state.globals.fadeTime, presetIndex: step.index, cue: index });
}

// Next / Prev. With a running order they walk it and stop at either end;
// without one they walk the presets, round and round, as they always did.
export function stepShow(store, direction) {
  const { steps, cue, off } = orderView(store.state);
  if (!steps.length) return stepPreset(store, direction);
  if (cue < 0) return applyStep(store, 0);
  if (off) return applyStep(store, cue);
  const target = cue + direction;
  if (target >= 0 && target < steps.length) applyStep(store, target);
}

// ------------------------------------------------------------------ files ---

// The file holds the presets and, when there is one, the running order. Its
// steps point at presets by their place in the file, so the file means the
// same thing in any browser.
export function exportPresets(list, steps = []) {
  const order = steps
    .map((s) => ({ preset: list.findIndex((p) => p.id === s.preset), note: s.note, fade: s.fade }))
    .filter((s) => s.preset >= 0);
  const presets = list.map(({ name, fade, scene }) => ({ name, fade, scene }));
  return JSON.stringify({ format: FILE_TAG, version: 1, presets, ...(order.length ? { order } : {}) }, null, 2);
}

// Accepts an export file or a bare array of presets. Throws on anything else.
// The presets come back with new ids (they are added to what is here), and
// the file's running order, if it has one, pointing at those.
export function parsePresetFile(text) {
  const data = JSON.parse(text);
  const list = Array.isArray(data) ? data : data?.presets;
  if (!Array.isArray(list)) throw new Error('This file does not contain presets.');
  const usable = list.filter((p) => p && typeof p === 'object' && p.scene);
  const { presets } = clean(usable, true);
  if (!presets.length) throw new Error('No usable presets in this file.');
  const order = (Array.isArray(data?.order) ? data.order : [])
    .filter((s) => s && typeof s === 'object' && list[s.preset] && usable.includes(list[s.preset]))
    .map((s) => ({ preset: presets[usable.indexOf(list[s.preset])].id, note: String(s.note ?? '').slice(0, MAX_NOTE), fade: cleanFade(s.fade) }));
  return { presets, order };
}
