// Presets: named scenes in localStorage, shared by /control and /output so a
// trigger on the phone can step through them even with /control closed.
//
// Shows sit beside them (24 November 2026): each a name, a tempo and a list
// of steps, each step pointing at a preset, so one preset can be used several
// times in a show and in several shows. One show is live; its steps are what
// Next and Prev walk ("the running order" before shows existed). With no
// steps in the live show the app behaves as if there were none.

import { factoryPresets } from './factory-presets.js';
import { sanitizeScene, sceneOf } from './state.js';
import { readJSON, uid, writeJSON } from './util.js';

export const PRESETS_KEY = 'thirdeye.presets.v1';
export const SHOWS_KEY = 'thirdeye.shows.v1';
// The single running order kept before shows; read once, into the first show.
const ORDER_KEY = 'thirdeye.order.v1';
const KEY = PRESETS_KEY;
const FILE_TAG = 'third-eye-cam-presets';
const SHOW_TAG = 'third-eye-cam-show';
export const MAX_SHOW_NAME = 40;

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

// Factory presets that are no longer in `list` (deleted, or renamed and
// then deleted): matched by id, and by name for a list older than the ids.
export function missingFactory(list = loadPresets()) {
  const ids = new Set(list.map((p) => p.id));
  const names = new Set(list.map((p) => String(p.name).toLowerCase()));
  return clean(factory()).presets.filter((p) => !ids.has(p.id) && !names.has(p.name.toLowerCase()));
}

export function resetPresets() {
  savePresets(factory());
  saveShows(firstShows([]));
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

// ------------------------------------------------------------------ shows ---

// A step: { preset (a preset's id), note, fade (seconds; null = the
// preset's own) }. Steps whose preset no longer exists are left out.
function cleanSteps(steps, known) {
  return (Array.isArray(steps) ? steps : [])
    .filter((s) => s && typeof s === 'object' && known.has(s.preset))
    .map((s) => ({ preset: s.preset, note: String(s.note ?? '').slice(0, MAX_NOTE), fade: cleanFade(s.fade) }));
}

const cleanBpm = (value) => {
  const bpm = Number(value);
  return value !== null && value !== undefined && value !== '' && Number.isFinite(bpm) ? Math.min(300, Math.max(30, bpm)) : null;
};

export const cleanShowName = (name, fallback = 'Untitled show') => String(name ?? '').trim().slice(0, MAX_SHOW_NAME) || fallback;

// The shows a browser starts with: one, holding the running order it had.
// The id is fixed so every window agrees on it before anything is saved.
function firstShows(steps) {
  return { live: 'show1', shows: [{ id: 'show1', name: 'My show', bpm: null, steps }] };
}

// { live (a show's id), shows: [{ id, name, bpm (null: leave the tempo
// alone), steps }] }. There is always at least one show.
export function loadShows(presets = loadPresets()) {
  let data = readJSON(SHOWS_KEY, null);
  if (!data || !Array.isArray(data.shows) || !data.shows.some((x) => x && typeof x === 'object')) {
    const old = readJSON(ORDER_KEY, null);
    data = firstShows(Array.isArray(old?.steps) ? old.steps : []);
  }
  const known = new Set(presets.map((p) => p.id));
  const seen = new Set();
  let minted = false;
  const shows = data.shows
    .filter((x) => x && typeof x === 'object')
    .map((x) => {
      let id = typeof x.id === 'string' && /^[a-z0-9]{3,16}$/.test(x.id) && !seen.has(x.id) ? x.id : '';
      if (!id) {
        do id = uid();
        while (id.length < 3 || seen.has(id));
        minted = true;
      }
      seen.add(id);
      return { id, name: cleanShowName(x.name), bpm: cleanBpm(x.bpm), steps: cleanSteps(x.steps, known) };
    });
  const live = shows.some((x) => x.id === data.live) ? data.live : shows[0].id;
  const out = { live, shows };
  if (minted) saveShows(out);
  return out;
}

export function saveShows(data) {
  writeJSON(SHOWS_KEY, { live: data.live, shows: data.shows });
}

export const liveShow = (data) => data.shows.find((x) => x.id === data.live) ?? data.shows[0];

// The live show's steps: what Next and Prev walk.
export function loadOrder(presets = loadPresets()) {
  return liveShow(loadShows(presets)).steps;
}

export function saveOrder(steps) {
  const data = loadShows();
  liveShow(data).steps = steps;
  saveShows(data);
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

// Steps for a file: each points at a preset by its place in the file's list,
// so the file means the same thing in any browser.
const stepsOut = (steps, list) =>
  steps.map((s) => ({ preset: list.findIndex((p) => p.id === s.preset), note: s.note, fade: s.fade })).filter((s) => s.preset >= 0);

// Steps read from a file, pointing at `presets` (cleaned from `usable`,
// which `list`, the file's own list, holds).
const stepsIn = (steps, list, usable, presets) =>
  (Array.isArray(steps) ? steps : [])
    .filter((s) => s && typeof s === 'object' && list[s.preset] && usable.includes(list[s.preset]))
    .map((s) => ({ preset: presets[usable.indexOf(list[s.preset])].id, note: String(s.note ?? '').slice(0, MAX_NOTE), fade: cleanFade(s.fade) }));

// The library file: every preset and every show. (`order`, the live show's
// steps, is kept for a browser from before shows.)
export function exportPresets(list, shows = null) {
  const presets = list.map(({ name, fade, scene }) => ({ name, fade, scene }));
  const live = shows ? liveShow(shows) : null;
  const order = live ? stepsOut(live.steps, list) : [];
  const showsOut = shows ? shows.shows.map((x) => ({ name: x.name, bpm: x.bpm, steps: stepsOut(x.steps, list) })) : [];
  return JSON.stringify({ format: FILE_TAG, version: 2, presets, ...(order.length ? { order } : {}), ...(showsOut.length ? { shows: showsOut } : {}) }, null, 2);
}

// Accepts a library file or a bare array of presets. Throws on anything else.
// The presets come back with new ids (they are added to what is here), and
// the file's shows pointing at those. A file from before shows, with a
// running order, gives one show of it.
export function parsePresetFile(text) {
  const data = JSON.parse(text);
  if (data?.format === SHOW_TAG) throw new Error('This is a show file: open it from the Show menu under the presets.');
  const list = Array.isArray(data) ? data : data?.presets;
  if (!Array.isArray(list)) throw new Error('This file does not contain presets.');
  const usable = list.filter((p) => p && typeof p === 'object' && p.scene);
  const { presets } = clean(usable, true);
  if (!presets.length) throw new Error('No usable presets in this file.');
  let shows = (Array.isArray(data?.shows) ? data.shows : [])
    .filter((x) => x && typeof x === 'object')
    .map((x) => ({ name: cleanShowName(x.name), bpm: cleanBpm(x.bpm), steps: stepsIn(x.steps, list, usable, presets) }));
  if (!shows.length && Array.isArray(data?.order) && data.order.length) {
    shows = [{ name: 'Imported show', bpm: null, steps: stepsIn(data.order, list, usable, presets) }];
  }
  return { presets, shows: shows.filter((x) => x.steps.length) };
}

// A show file: one show and the presets it uses, with their ids, so that
// opening it where those presets already are finds them.
export function exportShow(show, list) {
  const used = [...new Set(show.steps.map((s) => s.preset))].map((id) => list.find((p) => p.id === id)).filter(Boolean);
  return JSON.stringify({ format: SHOW_TAG, version: 1, name: show.name, bpm: show.bpm, steps: stepsOut(show.steps, used), presets: used.map(({ id, name, fade, scene }) => ({ id, name, fade, scene })) }, null, 2);
}

// { name, bpm, steps (pointing at the presets' ids), presets (keeping the
// ids the file gives, where it gives one) }. Throws on anything else.
export function parseShowFile(text) {
  const data = JSON.parse(text);
  if (data?.format !== SHOW_TAG) throw new Error(data?.format === FILE_TAG ? 'This is a preset library file: import it under Setup → Preset library.' : 'This is not a show file.');
  const list = Array.isArray(data.presets) ? data.presets : [];
  const usable = list.filter((p) => p && typeof p === 'object' && p.scene);
  const { presets } = clean(usable);
  return { name: cleanShowName(data.name), bpm: cleanBpm(data.bpm), steps: stepsIn(data.steps, list, usable, presets), presets };
}

// The name a show's file is saved under.
export const showFileName = (name) => `${cleanShowName(name).replace(/[\\/:*?"<>|]+/g, '-').replace(/\s+/g, ' ').trim() || 'Show'}.thirdeye-show.json`;
